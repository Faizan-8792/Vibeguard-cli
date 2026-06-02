import type { CommandContext } from '../cli.js';
export interface CleanCommandOptions {
    plan: boolean;
    apply: boolean;
    interactive: boolean;
    dryRun: boolean;
    gitSafe: boolean;
    force: boolean;
}
export declare function runClean(ctx: CommandContext, opts: CleanCommandOptions): Promise<void>;
