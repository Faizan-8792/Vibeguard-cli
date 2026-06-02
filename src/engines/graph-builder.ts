import { Project, SourceFile, SyntaxKind } from 'ts-morph';
import { resolve, relative, dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { hashFile } from '../utils/hash-utils.js';
import { FileStoreImpl } from '../storage/file-store.js';
import type { ResolvedConfig } from '../storage/config-store.js';
import type { Logger } from '../utils/logger.js';

export interface GraphNode {
  file: string;
  imports: string[];
  exports: string[];
  dependents: string[];
}

export interface GraphData {
  schemaVersion: string;
  nodes: Record<string, GraphNode>;
}

export interface AnalysisMeta {
  schemaVersion: string;
  buildTimestamp: string;
  fileHashes: Record<string, string>;
  parseErrors: Array<{ file: string; error: string }>;
  warnings: string[];
}

export interface GraphBuildResult {
  nodes: Map<string, GraphNode>;
  summary: { nodes: number; edges: number; rebuilt: number; skipped: number };
}

const GRAPH_SCHEMA_VERSION = '1.0.0';

export async function buildGraph(
  projectRoot: string,
  files: string[],
  config: ResolvedConfig,
  logger: Logger
): Promise<GraphBuildResult> {
  const store = new FileStoreImpl(projectRoot);

  // Load existing meta for incremental
  const existingMeta = await store.read<AnalysisMeta>('analysis-meta.json');
  const existingGraph = await store.read<GraphData>('graph.json');

  const needsFullRebuild =
    !existingMeta ||
    !existingGraph ||
    existingMeta.schemaVersion !== GRAPH_SCHEMA_VERSION ||
    existingGraph.schemaVersion !== GRAPH_SCHEMA_VERSION;

  // Compute current hashes
  const currentHashes: Record<string, string> = {};
  for (const file of files) {
    try {
      currentHashes[file] = await hashFile(resolve(projectRoot, file));
    } catch {
      // File might have been deleted between resolve and hash
    }
  }

  // Determine which files need rebuilding
  let filesToRebuild: string[];
  let skippedCount: number;

  if (needsFullRebuild) {
    filesToRebuild = files;
    skippedCount = 0;
    logger.debug('Performing full graph rebuild');
  } else {
    filesToRebuild = [];
    for (const file of files) {
      const oldHash = existingMeta.fileHashes[file];
      if (!oldHash || oldHash !== currentHashes[file]) {
        filesToRebuild.push(file);
      }
    }
    skippedCount = files.length - filesToRebuild.length;
    logger.debug(`Incremental rebuild: ${filesToRebuild.length} changed, ${skippedCount} skipped`);
  }

  // Parse files with ts-morph
  let tsConfigPath: string | undefined;
  try {
    const tscPath = resolve(projectRoot, 'tsconfig.json');
    await readFile(tscPath);
    tsConfigPath = tscPath;
  } catch {
    // No tsconfig
  }

  const project = new Project({
    tsConfigFilePath: tsConfigPath,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: tsConfigPath ? undefined : { allowJs: true, esModuleInterop: true },
  });

  // Add files to parse
  const absoluteFiles = filesToRebuild.map((f) => resolve(projectRoot, f));
  for (const absFile of absoluteFiles) {
    try {
      project.addSourceFileAtPath(absFile);
    } catch {
      // Skip files that can't be added
    }
  }

  // Build nodes from parsed files
  const nodes: Map<string, GraphNode> = new Map();
  const parseErrors: Array<{ file: string; error: string }> = [];

  // Carry over unchanged nodes from existing graph
  if (!needsFullRebuild && existingGraph) {
    for (const file of files) {
      if (!filesToRebuild.includes(file) && existingGraph.nodes[file]) {
        nodes.set(file, { ...existingGraph.nodes[file] });
      }
    }
  }

  // Parse rebuilt files
  for (const sourceFile of project.getSourceFiles()) {
    const absPath = sourceFile.getFilePath();
    const rel = relative(projectRoot, absPath).replace(/\\/g, '/');

    try {
      const imports = extractImports(sourceFile, projectRoot, rel);
      const exports = extractExports(sourceFile);

      nodes.set(rel, {
        file: rel,
        imports,
        exports,
        dependents: [], // computed below
      });
    } catch (err) {
      parseErrors.push({
        file: rel,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Compute dependents
  for (const node of nodes.values()) {
    node.dependents = [];
  }
  for (const [filePath, node] of nodes) {
    for (const imp of node.imports) {
      const target = nodes.get(imp);
      if (target && !target.dependents.includes(filePath)) {
        target.dependents.push(filePath);
      }
    }
  }

  // Count edges
  let edgeCount = 0;
  for (const node of nodes.values()) {
    edgeCount += node.imports.length;
  }

  // Persist
  const graphData: GraphData = {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes: Object.fromEntries(nodes),
  };

  const meta: AnalysisMeta = {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    buildTimestamp: new Date().toISOString(),
    fileHashes: currentHashes,
    parseErrors,
    warnings: [],
  };

  await store.write('graph.json', graphData);
  await store.write('analysis-meta.json', meta);

  return {
    nodes,
    summary: {
      nodes: nodes.size,
      edges: edgeCount,
      rebuilt: filesToRebuild.length,
      skipped: skippedCount,
    },
  };
}

function extractImports(sourceFile: SourceFile, projectRoot: string, currentFile: string): string[] {
  const imports: string[] = [];
  const currentDir = dirname(resolve(projectRoot, currentFile));

  for (const decl of sourceFile.getImportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue();
    const resolved = resolveImportSpecifier(specifier, currentDir, projectRoot);
    if (resolved) {
      imports.push(resolved);
    }
  }

  // Also check dynamic imports
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of callExpressions) {
    const expr = call.getExpression();
    if (expr.getKind() === SyntaxKind.ImportKeyword) {
      const args = call.getArguments();
      if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
        const specifier = args[0].getText().slice(1, -1); // Remove quotes
        const resolved = resolveImportSpecifier(specifier, currentDir, projectRoot);
        if (resolved) {
          imports.push(resolved);
        }
      }
    }
  }

  return [...new Set(imports)];
}

function resolveImportSpecifier(specifier: string, currentDir: string, projectRoot: string): string | null {
  // Skip bare package imports (external)
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return null;
  }

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  const resolved = resolve(currentDir, specifier);
  const rel = relative(projectRoot, resolved).replace(/\\/g, '/');

  // Try exact match or with extensions
  for (const ext of ['', ...extensions]) {
    const candidate = rel + ext;
    // We'll accept it as-is — the graph will only contain files that exist
    if (ext === '' && extensions.some((e) => rel.endsWith(e))) {
      return rel;
    }
    if (ext !== '') {
      return candidate;
    }
  }

  // Try index files
  for (const ext of extensions) {
    const candidate = rel + '/index' + ext;
    return candidate;
  }

  return rel;
}

function extractExports(sourceFile: SourceFile): string[] {
  const exports: string[] = [];

  for (const decl of sourceFile.getExportedDeclarations()) {
    const [name] = decl;
    if (name !== 'default') {
      exports.push(name);
    } else {
      exports.push('default');
    }
  }

  return exports;
}

export async function loadGraph(projectRoot: string): Promise<GraphData | null> {
  const store = new FileStoreImpl(projectRoot);
  const graph = await store.read<GraphData>('graph.json');
  if (graph && graph.schemaVersion === GRAPH_SCHEMA_VERSION) {
    return graph;
  }
  return null;
}
