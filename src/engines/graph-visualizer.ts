import type { GraphNode } from './graph-builder.js';
import type { SelectedFile } from './context-radius-engine.js';
import { brand } from '../utils/ui.js';

/**
 * Renders a beautiful ASCII dependency graph showing connections between selected files.
 * Uses box-drawing characters for a clean look.
 */
export function renderDependencyGraph(
  selectedFiles: SelectedFile[],
  graphNodes: Map<string, GraphNode>,
): string {
  const lines: string[] = [];
  const selectedSet = new Set(selectedFiles.map((f) => f.path));

  lines.push('');
  lines.push(`  ${brand.primary.bold('╭─── Dependency Graph ───────────────────────────╮')}`);
  lines.push('');

  if (selectedFiles.length === 0) {
    lines.push(`  ${brand.muted('  No files selected')}`);
    lines.push(`  ${brand.primary.bold('╰────────────────────────────────────────────────╯')}`);
    return lines.join('\n');
  }

  // Build adjacency info for selected files only
  for (const file of selectedFiles) {
    const node = graphNodes.get(file.path);
    const shortName = shortenPath(file.path);

    // File node with role indicator
    const roleColor = file.role === 'seed' ? brand.success : brand.secondary;
    const roleLabel = file.role === 'seed' ? '●' : '○';
    lines.push(`  ${roleColor(roleLabel)} ${brand.info.bold(shortName)} ${brand.muted(`[imp:${file.importance}]`)}`);

    if (node) {
      // Show imports that are also in the selected set
      const relevantImports = resolveImports(node.imports, graphNodes)
        .filter((imp) => selectedSet.has(imp) && imp !== file.path);
      // Show dependents that are also in the selected set
      const relevantDependents = node.dependents
        .filter((dep) => selectedSet.has(dep));

      if (relevantImports.length > 0) {
        for (let i = 0; i < relevantImports.length; i++) {
          const isLast = i === relevantImports.length - 1;
          const connector = isLast ? '└──▶' : '├──▶';
          lines.push(`  ${brand.muted('  ' + connector)} ${brand.secondary(shortenPath(relevantImports[i]))}`);
        }
      }

      if (relevantDependents.length > 0) {
        for (let i = 0; i < relevantDependents.length; i++) {
          const isLast = i === relevantDependents.length - 1;
          const connector = isLast ? '└◀──' : '├◀──';
          lines.push(`  ${brand.muted('  ' + connector)} ${brand.warning(shortenPath(relevantDependents[i]))}`);
        }
      }
    }
    lines.push('');
  }

  // Legend
  lines.push(`  ${brand.muted('  ── Legend ──')}`);
  lines.push(`  ${brand.success('●')} ${brand.muted('seed (direct match)')}  ${brand.secondary('○')} ${brand.muted('expanded (via graph)')}`);
  lines.push(`  ${brand.muted('──▶ imports')}  ${brand.muted('◀── imported by')}`);
  lines.push('');
  lines.push(`  ${brand.primary.bold('╰────────────────────────────────────────────────╯')}`);

  return lines.join('\n');
}

/**
 * Renders a compact summary of the graph structure for a set of files.
 */
export function renderGraphSummary(
  selectedFiles: SelectedFile[],
  graphNodes: Map<string, GraphNode>,
  task: string,
): string {
  const lines: string[] = [];
  const seeds = selectedFiles.filter((f) => f.role === 'seed');
  const expanded = selectedFiles.filter((f) => f.role !== 'seed');

  lines.push('');
  lines.push(`  ${brand.primary.bold('📊 Context Selection')}`);
  lines.push(`  ${brand.muted('Task:')} ${brand.secondary(task.length > 60 ? task.slice(0, 57) + '...' : task)}`);
  lines.push('');
  lines.push(`  ${brand.success.bold(String(seeds.length))} ${brand.muted('seed files (direct match)')}`);
  lines.push(`  ${brand.info.bold(String(expanded.length))} ${brand.muted('expanded files (via graph)')}`);
  lines.push(`  ${brand.muted.bold(String(selectedFiles.length))} ${brand.muted('total files selected')}`);
  lines.push('');

  return lines.join('\n');
}

function shortenPath(path: string): string {
  // Shorten common prefixes for readability
  return path
    .replace(/^src\//, '')
    .replace(/^engines\//, 'eng/')
    .replace(/^commands\//, 'cmd/')
    .replace(/^storage\//, 'store/')
    .replace(/^utils\//, 'util/');
}

/**
 * Resolve .js imports to their .ts equivalents if the .ts exists in graphNodes
 */
function resolveImports(imports: string[], graphNodes: Map<string, GraphNode>): string[] {
  return imports.map((imp) => {
    if (graphNodes.has(imp)) return imp;
    const tsVariant = imp.replace(/\.js$/, '.ts').replace(/\.mjs$/, '.ts');
    if (graphNodes.has(tsVariant)) return tsVariant;
    return imp;
  }).filter((imp) => graphNodes.has(imp));
}
