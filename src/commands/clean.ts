import { scanDeadCode, type DeadCodeCandidate } from '../engines/dead-code-scanner.js';
import { loadGraph } from '../engines/graph-builder.js';
import { loadImportance } from '../engines/importance-analyzer.js';
import { FileStoreImpl } from '../storage/file-store.js';
import { TrashStoreImpl } from '../storage/trash-store.js';
import { SafetyContext } from '../utils/safety.js';
import { createGitUtils } from '../utils/git-utils.js';
import { VibeguardError, ErrorCodes } from '../utils/errors.js';
import { emitJson } from '../utils/json-output.js';
import { header, keyValue, divider, summaryLine, statusIcon, filePath, brand, table, type TableColumn } from '../utils/ui.js';
import type { CommandContext } from '../cli.js';

export interface CleanCommandOptions {
  plan: boolean;
  apply: boolean;
  interactive: boolean;
  dryRun: boolean;
  gitSafe: boolean;
  force: boolean;
}

interface CleanupPlan {
  schemaVersion: string;
  createdAt: string;
  candidates: DeadCodeCandidate[];
}

export async function runClean(ctx: CommandContext, opts: CleanCommandOptions): Promise<void> {
  const { config, logger, projectRoot, options } = ctx;

  // Load graph
  const graphData = await loadGraph(projectRoot);
  if (!graphData) {
    throw new VibeguardError(
      ErrorCodes.CONFIG_NOT_FOUND,
      'No graph found. Run `vibeguard map` first.',
    );
  }

  // Load importance
  const importanceScores = await loadImportance(projectRoot) ?? {};

  const graphNodes = new Map(Object.entries(graphData.nodes));

  if (opts.plan || (!opts.apply && !opts.plan)) {
    // Generate plan
    logger.startSpinner('Scanning for dead code...');

    const result = await scanDeadCode(projectRoot, graphNodes, importanceScores);

    logger.stopSpinner(true);

    // Sort by ascending importance
    result.candidates.sort((a, b) => a.importance - b.importance);

    // Write cleanup plan
    const fileStore = new FileStoreImpl(projectRoot);
    const plan: CleanupPlan = {
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      candidates: result.candidates,
    };
    await fileStore.write('cleanup-plan.json', plan);

    if (options.json) {
      emitJson({
        candidates: result.candidates,
        summary: result.summary,
        ...(result.warning ? { warning: result.warning } : {}),
      });
    } else {
      const output: string[] = [];

      output.push(header('Dead Code Analysis', '🧹'));
      output.push('');

      if (result.warning) {
        output.push(`  ${statusIcon('warning')} ${brand.warning(result.warning)}`);
        output.push('');
        process.stdout.write(output.join('\n') + '\n');
        return;
      }

      output.push(summaryLine([
        { label: 'Unused Files', value: result.summary.unusedFiles, color: result.summary.unusedFiles > 0 ? 'warning' : 'success' },
        { label: 'Unused Exports', value: result.summary.unusedExports, color: result.summary.unusedExports > 0 ? 'warning' : 'success' },
        { label: 'Duplicates', value: result.summary.duplicateComponents, color: 'muted' },
      ]));
      output.push('');

      if (result.candidates.length > 0) {
        output.push(divider());
        output.push('');
        output.push(`  ${brand.muted.bold('Candidates (sorted by importance):')}`);
        output.push('');

        for (const c of result.candidates.slice(0, 20)) {
          const kindIcon = c.kind === 'file' ? '📄' : c.kind === 'export' ? '📤' : '📥';
          const impColor = c.importance <= 2 ? 'success' : c.importance <= 5 ? 'warning' : 'danger';
          output.push(`  ${kindIcon} ${filePath(c.path)} ${brand[impColor](`imp:${c.importance}`)}`);
        }

        if (result.candidates.length > 20) {
          output.push(`  ${brand.muted(`  ... and ${result.candidates.length - 20} more`)}`);
        }
        output.push('');
      }

      output.push(`  ${statusIcon('success')} ${brand.success('Plan saved to')} ${brand.muted('.vibeguard/cleanup-plan.json')}`);
      output.push(`  ${brand.muted('Run with --apply to move dead files to trash')}`);
      output.push('');

      process.stdout.write(output.join('\n') + '\n');
    }
    return;
  }

  if (opts.apply) {
    // Load existing plan
    const fileStore = new FileStoreImpl(projectRoot);
    const plan = await fileStore.read<CleanupPlan>('cleanup-plan.json');

    if (!plan) {
      throw new VibeguardError(
        ErrorCodes.CONFIG_NOT_FOUND,
        'No cleanup plan found. Run `vibeguard clean --plan` first.',
      );
    }

    const fileCandidates = plan.candidates.filter((c: DeadCodeCandidate) => c.kind === 'file');

    // Enforce limits
    if (fileCandidates.length > config.clean.maxChangesPerRun && !opts.force) {
      throw new VibeguardError(
        ErrorCodes.LIMIT_EXCEEDED,
        `Cleanup plan has ${fileCandidates.length} file candidates, exceeding limit of ${config.clean.maxChangesPerRun}. Use --force to override.`,
        { count: fileCandidates.length, limit: config.clean.maxChangesPerRun }
      );
    }

    const safety = new SafetyContext({
      dryRun: opts.dryRun,
      gitSafe: opts.gitSafe,
      force: opts.force,
      projectRoot,
    });

    if (opts.gitSafe) {
      const gitUtils = createGitUtils();
      await safety.enforceGitSafe(gitUtils, 'clean');
    }

    if (opts.dryRun) {
      logger.info(`[dry-run] Would move ${fileCandidates.length} files to trash:`);
      for (const candidate of fileCandidates) {
        logger.info(`  ${candidate.path} (importance: ${candidate.importance})`);
      }

      if (options.json) {
        emitJson({
          dryRun: true,
          plannedChanges: fileCandidates.map((c: DeadCodeCandidate) => ({
            type: 'move',
            path: c.path,
            target: `.vibeguard-trash/`,
          })),
        });
      }
      return;
    }

    // Apply: move files to trash
    const trashStore = new TrashStoreImpl(projectRoot);
    let movedCount = 0;

    for (const candidate of fileCandidates) {
      try {
        // trashStore.move expects a path RELATIVE to projectRoot
        await trashStore.move(candidate.path, {
          originalPath: candidate.path,
          importance: candidate.importance,
          lastCommitDate: candidate.lastCommitDate,
          kind: candidate.kind,
        });
        movedCount++;
        logger.debug(`Moved to trash: ${candidate.path}`);
      } catch (err) {
        logger.warn(`Failed to move ${candidate.path}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    if (opts.gitSafe) {
      const gitUtils = createGitUtils();
      await safety.commitGitSafe(gitUtils, 'clean');
    }

    if (options.json) {
      emitJson({
        applied: true,
        movedFiles: movedCount,
        totalCandidates: fileCandidates.length,
      });
    } else {
      logger.info(`Moved ${movedCount} files to .vibeguard-trash/`);
    }
  }
}
