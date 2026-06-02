import { resolve } from 'node:path';
import { loadConfig } from './storage/config-store.js';
import { createLogger } from './utils/logger.js';
import { buildGraph, type GraphData, type GraphNode } from './engines/graph-builder.js';
import { computeTags } from './engines/tagging-engine.js';
import { computeImportance, type ImportanceEntry } from './engines/importance-analyzer.js';
import { selectContext, type PackMode } from './engines/context-radius-engine.js';
import { generateContextPackage, type ContextPackage } from './engines/context-package-generator.js';
import { estimateCost } from './engines/cost-estimator.js';
import { resolveFiles } from './utils/glob-resolver.js';
import { FileStoreImpl } from './storage/file-store.js';

export type { ContextPackage } from './engines/context-package-generator.js';
export type { PackMode } from './engines/context-radius-engine.js';

export async function runCommand(
  name: string,
  args: string[],
  options?: { cwd?: string; config?: string },
): Promise<unknown> {
  const projectRoot = resolve(options?.cwd || process.cwd());
  const config = await loadConfig(projectRoot, options?.config);
  const logger = createLogger({ jsonMode: true, quiet: true, verbose: false, command: name });

  const ctx = {
    options: {
      json: true,
      cwd: projectRoot,
      include: [] as string[],
      exclude: [] as string[],
      config: options?.config,
      verbose: false,
      quiet: true,
    },
    config,
    logger,
    projectRoot,
  };

  switch (name) {
    case 'init': {
      const { runInit } = await import('./commands/init.js');
      await runInit(ctx, { force: args.includes('--force') });
      return { success: true };
    }
    case 'map': {
      const { runMap } = await import('./commands/map.js');
      await runMap(ctx);
      return { success: true };
    }
    case 'security': {
      const { runSecurity } = await import('./commands/security.js');
      await runSecurity(ctx, { dryRun: false, gitSafe: false, force: false });
      return { success: true };
    }
    case 'clean': {
      const { runClean } = await import('./commands/clean.js');
      await runClean(ctx, { plan: true, apply: false, interactive: false, dryRun: false, gitSafe: false, force: false });
      return { success: true };
    }
    case 'doctor': {
      const { runDoctor } = await import('./commands/doctor.js');
      await runDoctor(ctx);
      return { success: true };
    }
    default:
      throw new Error(`Unknown command: ${name}`);
  }
}

export async function generateContextForEditor(
  task: string,
  options?: { radius?: number; budget?: number; mode?: PackMode; cwd?: string },
): Promise<ContextPackage> {
  const projectRoot = resolve(options?.cwd || process.cwd());
  const config = await loadConfig(projectRoot);
  const logger = createLogger({ jsonMode: true, quiet: true, verbose: false, command: 'pack' });
  const store = new FileStoreImpl(projectRoot);

  // Load or build graph
  let graphData = await store.read<GraphData>('graph.json');
  if (!graphData) {
    const files = await resolveFiles(projectRoot, config.effectiveInclude, config.effectiveSkipSet);
    const result = await buildGraph(projectRoot, files, config, logger);
    graphData = {
      schemaVersion: '1.0.0',
      nodes: Object.fromEntries(result.nodes),
    };
  }

  const graphNodes = new Map<string, GraphNode>(
    Object.entries(graphData.nodes),
  );

  // Load or compute tags
  const tagsData = await store.read<{ schemaVersion: string; tags: Record<string, string[]> }>('tags.json');
  const tags: Record<string, string[]> = tagsData
    ? tagsData.tags
    : await computeTags(projectRoot, graphNodes, config);

  // Load or compute importance
  const importanceData = await store.read<{ schemaVersion: string; scores: Record<string, ImportanceEntry> }>('importance.json');
  const importanceScores: Record<string, ImportanceEntry> = importanceData
    ? importanceData.scores
    : await computeImportance(projectRoot, graphNodes, config);

  // Select context — signature: (projectRoot, task, graphNodes, tags, importanceScores, config, opts)
  const selectionResult = await selectContext(
    projectRoot,
    task,
    graphNodes,
    tags,
    importanceScores,
    config,
    {
      radius: options?.radius,
      budget: options?.budget,
      mode: options?.mode,
    },
  );

  // Compute total project tokens for reduction percentage
  const allFiles = Object.keys(graphData.nodes);
  const totalEstimate = await estimateCost(allFiles, projectRoot, config);

  // Generate package — signature: (task, selectedFiles, tokenEstimates, totalProjectTokens, projectRoot, graphData?)
  return generateContextPackage(
    task,
    selectionResult.selectedFiles,
    selectionResult.tokenEstimates,
    totalEstimate.tokens,
    projectRoot,
    graphData,
  );
}

export function serializeContextPackageForAgent(pkg: ContextPackage): string {
  let md = `# Context for: ${pkg.task}\n\n`;
  md += `## Stack: ${pkg.detectedStack.join(', ') || 'unknown'}\n\n`;
  md += `## Files (${pkg.selectedFiles.length})\n\n`;

  for (const file of pkg.selectedFiles) {
    md += `- ${file.path} [${file.tags.slice(0, 5).join(', ')}] (importance: ${file.importance})\n`;
  }

  if (pkg.warnings.length > 0) {
    md += `\n## Warnings\n\n`;
    for (const w of pkg.warnings) {
      md += `- ${w}\n`;
    }
  }

  md += `\n## Budget: ~${pkg.tokenBudget.pointEstimate} tokens (${pkg.tokenBudget.reductionPercent}% reduction)\n`;

  return md;
}
