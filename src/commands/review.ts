import type { CommandContext } from '../context.js';
import { VibeguardError, ErrorCodes } from '../utils/errors.js';
import { emitJson } from '../utils/json-output.js';
import { header, keyValue, divider, summaryLine, statusIcon, filePath, brand, box } from '../utils/ui.js';

export interface ReviewCommandOptions {
  base?: string;
  depth?: number;
  brief?: boolean;
}

/**
 * Risk-scored review of the current change set.
 *
 * Combines graph blast-radius analysis with VibeGuard's security scan: every
 * changed file is scored by impact × importance × test-gaps, and any security
 * findings on changed files are folded into the same report. `--brief` prints a
 * compact Token Savings panel comparing graph context to a full-context read.
 */
export async function runReview(ctx: CommandContext, opts: ReviewCommandOptions): Promise<void> {
  const { config, logger, projectRoot, options } = ctx;
  const base = opts.base ?? 'HEAD~1';

  const { createGitUtils } = await import('../utils/git-utils.js');
  const { loadGraph } = await import('../engines/graph-builder.js');
  const { loadImportance } = await import('../engines/importance-analyzer.js');
  const { detectChanges } = await import('../engines/change-detector.js');

  const git = createGitUtils();
  if (!(await git.isGitRepo(projectRoot))) {
    throw new VibeguardError(ErrorCodes.GIT_UNAVAILABLE, 'Not a git repository. `vibeguard review` needs git to find changes.');
  }

  const graph = await loadGraph(projectRoot);
  if (!graph) {
    throw new VibeguardError(ErrorCodes.CONFIG_NOT_FOUND, 'No graph found. Run `vibeguard map` first.');
  }

  if (!options.json) logger.startSpinner(`Reviewing changes since ${base}...`);

  const changedFiles = await git.getChangedFiles(base, projectRoot);

  // Fold security findings on changed files into the review (the differentiator).
  const { scanSecurity } = await import('../engines/security-scanner.js');
  const { resolveFiles } = await import('../utils/glob-resolver.js');
  const allFiles = await resolveFiles(projectRoot, config.effectiveInclude, config.effectiveSkipSet);
  const changedSet = new Set(changedFiles);
  const changedExisting = allFiles.filter((f) => changedSet.has(f));
  const secResult = changedExisting.length > 0
    ? await scanSecurity(projectRoot, changedExisting, config)
    : { issues: [], counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } };

  const importance = (await loadImportance(projectRoot)) ?? {};

  const result = detectChanges({
    graph,
    changedFiles,
    base,
    depth: opts.depth,
    importance,
    securityIssues: secResult.issues,
  });

  if (!options.json) logger.stopSpinner(true);

  if (options.json) {
    emitJson({ ...result });
    return;
  }

  if (opts.brief) {
    renderBrief(result);
    return;
  }

  renderFull(result);
}

function renderBrief(result: import('../engines/change-detector.js').ChangeReviewResult): void {
  const cs = result.contextSavings;
  const lines = [
    `Full context would be:   ${cs.fullContextTokens.toLocaleString()} tokens`,
    `Graph context used:      ${cs.graphContextTokens.toLocaleString()} tokens`,
    `Saved:                   ${cs.savedTokens.toLocaleString()} tokens (~${cs.savedPercent}%)`,
    `Changed ${result.summary.changed} · Affected ${result.summary.affected} · High-risk ${result.summary.highRisk} · Sec issues ${result.summary.securityIssues}`,
  ].join('\n');
  process.stdout.write('\n' + box(lines, { width: 64 }) + '\n');
}

function renderFull(result: import('../engines/change-detector.js').ChangeReviewResult): void {
  const output: string[] = [];
  output.push(header('Change Review'));
  output.push('');
  output.push(keyValue('Base', brand.secondary(result.base)));
  output.push(summaryLine([
    { label: 'Changed', value: result.summary.changed, color: 'info' },
    { label: 'Affected', value: result.summary.affected, color: result.summary.affected > 0 ? 'warning' : 'muted' },
    { label: 'High-risk', value: result.summary.highRisk, color: result.summary.highRisk > 0 ? 'danger' : 'muted' },
    { label: 'Test gaps', value: result.summary.testGaps, color: result.summary.testGaps > 0 ? 'warning' : 'muted' },
    { label: 'Sec issues', value: result.summary.securityIssues, color: result.summary.securityIssues > 0 ? 'danger' : 'muted' },
  ]));
  output.push('');

  if (result.changedFiles.length === 0) {
    output.push(`  ${statusIcon('success')} ${brand.success('No changes detected against the base ref.')}`);
    process.stdout.write(output.join('\n') + '\n');
    return;
  }

  if (result.reviewItems.length > 0) {
    output.push(divider());
    output.push('');
    output.push(`  ${brand.primary.bold('Review priority (highest risk first):')}`);
    output.push('');
    for (const item of result.reviewItems.slice(0, 20)) {
      const riskColor = item.risk >= 30 ? 'danger' : item.risk >= 15 ? 'warning' : 'muted';
      const flags: string[] = [];
      if (item.securityIssues > 0) flags.push(brand.danger(`🔒 ${item.securityIssues} sec`));
      if (item.testGap) flags.push(brand.warning('no tests'));
      if (item.isolated) flags.push(brand.muted('isolated'));
      output.push(`  ${brand[riskColor].bold(`[risk ${item.risk}]`)} ${filePath(item.file)}`);
      output.push(`     ${brand.muted(`blast radius: ${item.blastRadius} · importance: ${item.importance}`)}${flags.length ? ' · ' + flags.join(' · ') : ''}`);
    }
    output.push('');
  }

  if (result.unknownFiles.length > 0) {
    output.push(`  ${brand.muted(`${result.unknownFiles.length} changed file(s) not in graph (new/excluded) — run \`vibeguard map\` to include them.`)}`);
    output.push('');
  }

  const cs = result.contextSavings;
  output.push(box([
    `Full context would be:   ${cs.fullContextTokens.toLocaleString()} tokens`,
    `Graph context used:      ${cs.graphContextTokens.toLocaleString()} tokens`,
    `Saved:                   ${cs.savedTokens.toLocaleString()} tokens (~${cs.savedPercent}%)`,
  ].join('\n'), { width: 64 }));
  output.push('');

  process.stdout.write(output.join('\n') + '\n');
}
