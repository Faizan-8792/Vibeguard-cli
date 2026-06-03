import type { CommandContext } from '../context.js';
import { CodeScoutError, ErrorCodes } from '../utils/errors.js';
import { emitJson } from '../utils/json-output.js';
import { header, keyValue, divider, statusIcon, filePath, brand } from '../utils/ui.js';

export interface FlowsCommandOptions {
  /** Which analysis to show: flows (default), bridges, gaps, or all. */
  view?: string;
  limit?: number;
}

/**
 * Surface execution flows, architectural bridges, and knowledge gaps from the
 * dependency graph — the "deeper graph intelligence" pillar.
 */
export async function runFlows(ctx: CommandContext, opts: FlowsCommandOptions): Promise<void> {
  const { logger, projectRoot, options } = ctx;
  const view = (opts.view ?? 'flows').toLowerCase();
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;

  const { loadGraph } = await import('../engines/graph-builder.js');
  const { detectFlows, detectBridges, detectKnowledgeGaps } = await import('../engines/flow-analyzer.js');

  const graph = await loadGraph(projectRoot);
  if (!graph) {
    throw new CodeScoutError(ErrorCodes.CONFIG_NOT_FOUND, 'No graph found. Run `codescout map` first.');
  }

  if (!options.json) logger.startSpinner('Analyzing execution flows...');
  const flows = detectFlows(graph, limit);
  const bridges = detectBridges(graph, limit);
  const gaps = detectKnowledgeGaps(graph);
  if (!options.json) logger.stopSpinner(true);

  if (options.json) {
    if (view === 'bridges') emitJson({ bridges });
    else if (view === 'gaps') emitJson({ gaps });
    else if (view === 'all') emitJson({ flows, bridges, gaps });
    else emitJson({ flows });
    return;
  }

  const output: string[] = [];

  if (view === 'flows' || view === 'all') {
    output.push(header('Execution Flows', '🌊'));
    output.push('');
    if (flows.length === 0) {
      output.push(`  ${statusIcon('info')} ${brand.muted('No entry points detected.')}`);
    } else {
      for (const flow of flows.slice(0, limit)) {
        output.push(`  ${brand.primary.bold(`[${flow.kind}]`)} ${filePath(flow.entry)} ${brand.muted(`crit:${flow.criticality}`)}`);
        output.push(`     ${brand.muted(`reaches ${flow.members.length} files, depth ${flow.depth}`)}`);
      }
    }
    output.push('');
  }

  if (view === 'bridges' || view === 'all') {
    output.push(header('Architectural Bridges', '🌉'));
    output.push(`  ${brand.muted('(chokepoints — many paths flow through these)')}`);
    output.push('');
    if (bridges.length === 0) {
      output.push(`  ${statusIcon('info')} ${brand.muted('No significant bridges found.')}`);
    } else {
      for (const b of bridges.slice(0, limit)) {
        output.push(`  ${brand.warning.bold(`[${b.score}]`)} ${filePath(b.file)}`);
      }
    }
    output.push('');
  }

  if (view === 'gaps' || view === 'all') {
    output.push(header('Knowledge Gaps', '🕳️'));
    output.push('');
    output.push(keyValue('Isolated files', brand.info(String(gaps.isolatedFiles.length))));
    output.push(keyValue('Untested hotspots', gaps.untestedHotspots.length > 0 ? brand.warning(String(gaps.untestedHotspots.length)) : brand.muted('0')));
    output.push('');
    if (gaps.untestedHotspots.length > 0) {
      output.push(`  ${brand.warning.bold('Untested hotspots')} ${brand.muted('(heavily depended on, no test coverage):')}`);
      for (const h of gaps.untestedHotspots) {
        output.push(`    ${filePath(h.file)} ${brand.muted(`(${h.dependents} dependents)`)}`);
      }
      output.push('');
    }
    if (gaps.isolatedFiles.length > 0) {
      output.push(`  ${brand.muted('Isolated (no imports, no dependents):')}`);
      for (const f of gaps.isolatedFiles.slice(0, 10)) {
        output.push(`    ${filePath(f)}`);
      }
      output.push('');
    }
  }

  output.push(divider());
  output.push(`  ${brand.muted('Views:')} ${brand.secondary('--view flows|bridges|gaps|all')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}
