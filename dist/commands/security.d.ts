import type { CommandContext } from '../cli.js';
export interface SecurityCommandOptions {
    fix?: string;
    dryRun: boolean;
    gitSafe: boolean;
    force: boolean;
}
export declare function runSecurity(ctx: CommandContext, opts: SecurityCommandOptions): Promise<void>;
