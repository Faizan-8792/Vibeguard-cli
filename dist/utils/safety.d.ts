import type { GitUtils } from './git-utils.js';
export interface DryRunChange {
    type: 'create' | 'modify' | 'delete' | 'move';
    path: string;
    targetPath?: string;
    diff?: string;
}
export declare class SafetyContext {
    private dryRunChanges;
    readonly isDryRun: boolean;
    readonly isGitSafe: boolean;
    readonly isForce: boolean;
    readonly projectRoot: string;
    constructor(options: {
        dryRun: boolean;
        gitSafe: boolean;
        force: boolean;
        projectRoot: string;
    });
    recordChange(change: DryRunChange): void;
    getPlannedChanges(): DryRunChange[];
    enforceProjectBoundary(filePath: string): void;
    enforceMaxFiles(count: number, limit: number): void;
    enforceGitSafe(gitUtils: GitUtils, command: string): Promise<void>;
    commitGitSafe(gitUtils: GitUtils, command: string): Promise<void>;
}
