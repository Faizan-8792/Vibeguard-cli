import { resolve, relative } from 'node:path';
import { CodeScoutError, ErrorCodes } from './errors.js';
import type { GitUtils } from './git-utils.js';

export interface DryRunChange {
  type: 'create' | 'modify' | 'delete' | 'move';
  path: string;
  targetPath?: string;
  diff?: string;
}

export class SafetyContext {
  private dryRunChanges: DryRunChange[] = [];
  public readonly isDryRun: boolean;
  public readonly isGitSafe: boolean;
  public readonly isForce: boolean;
  public readonly projectRoot: string;

  constructor(options: {
    dryRun: boolean;
    gitSafe: boolean;
    force: boolean;
    projectRoot: string;
  }) {
    this.isDryRun = options.dryRun;
    this.isGitSafe = options.gitSafe;
    this.isForce = options.force;
    this.projectRoot = options.projectRoot;
  }

  recordChange(change: DryRunChange): void {
    this.dryRunChanges.push(change);
  }

  getPlannedChanges(): DryRunChange[] {
    return [...this.dryRunChanges];
  }

  enforceProjectBoundary(filePath: string): void {
    const resolved = resolve(filePath);
    const resolvedRoot = resolve(this.projectRoot);
    const rel = relative(resolvedRoot, resolved);
    if (rel.startsWith('..') || resolve(resolved) === resolvedRoot) {
      throw new CodeScoutError(
        ErrorCodes.LIMIT_EXCEEDED,
        `Path "${filePath}" is outside the project root`,
        { path: filePath, projectRoot: this.projectRoot }
      );
    }
  }

  enforceMaxFiles(count: number, limit: number): void {
    if (count > limit && !this.isForce) {
      throw new CodeScoutError(
        ErrorCodes.LIMIT_EXCEEDED,
        `Operation would affect ${count} files, exceeding the limit of ${limit}. Use --force to override.`,
        { count, limit }
      );
    }
  }

  async enforceGitSafe(gitUtils: GitUtils, command: string): Promise<void> {
    if (!this.isGitSafe) return;

    const isClean = await gitUtils.isWorkingTreeClean(this.projectRoot);
    if (!isClean) {
      throw new CodeScoutError(
        ErrorCodes.DIRTY_WORKTREE,
        'Working tree is not clean. Commit or stash changes before using --git-safe.',
      );
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const branchName = `codescout/${command}-${timestamp}`;
    await gitUtils.createBranch(branchName, this.projectRoot);
  }

  async commitGitSafe(gitUtils: GitUtils, command: string): Promise<void> {
    if (!this.isGitSafe) return;
    await gitUtils.commitAll(`codescout ${command}: automated changes`, this.projectRoot);
  }
}
