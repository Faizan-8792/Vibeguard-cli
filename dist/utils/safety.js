import { resolve, relative } from 'node:path';
import { VibeguardError, ErrorCodes } from './errors.js';
export class SafetyContext {
    dryRunChanges = [];
    isDryRun;
    isGitSafe;
    isForce;
    projectRoot;
    constructor(options) {
        this.isDryRun = options.dryRun;
        this.isGitSafe = options.gitSafe;
        this.isForce = options.force;
        this.projectRoot = options.projectRoot;
    }
    recordChange(change) {
        this.dryRunChanges.push(change);
    }
    getPlannedChanges() {
        return [...this.dryRunChanges];
    }
    enforceProjectBoundary(filePath) {
        const resolved = resolve(filePath);
        const resolvedRoot = resolve(this.projectRoot);
        const rel = relative(resolvedRoot, resolved);
        if (rel.startsWith('..') || resolve(resolved) === resolvedRoot) {
            throw new VibeguardError(ErrorCodes.LIMIT_EXCEEDED, `Path "${filePath}" is outside the project root`, { path: filePath, projectRoot: this.projectRoot });
        }
    }
    enforceMaxFiles(count, limit) {
        if (count > limit && !this.isForce) {
            throw new VibeguardError(ErrorCodes.LIMIT_EXCEEDED, `Operation would affect ${count} files, exceeding the limit of ${limit}. Use --force to override.`, { count, limit });
        }
    }
    async enforceGitSafe(gitUtils, command) {
        if (!this.isGitSafe)
            return;
        const isClean = await gitUtils.isWorkingTreeClean(this.projectRoot);
        if (!isClean) {
            throw new VibeguardError(ErrorCodes.DIRTY_WORKTREE, 'Working tree is not clean. Commit or stash changes before using --git-safe.');
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const branchName = `vibeguard/${command}-${timestamp}`;
        await gitUtils.createBranch(branchName, this.projectRoot);
    }
    async commitGitSafe(gitUtils, command) {
        if (!this.isGitSafe)
            return;
        await gitUtils.commitAll(`vibeguard ${command}: automated changes`, this.projectRoot);
    }
}
//# sourceMappingURL=safety.js.map