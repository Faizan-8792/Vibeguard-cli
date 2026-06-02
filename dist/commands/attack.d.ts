import type { CommandContext } from '../cli.js';
export interface AttackCommandOptions {
    ai: boolean;
    fix: boolean;
    dryRun: boolean;
    budget?: number;
}
export declare function runAttack(ctx: CommandContext, opts: AttackCommandOptions): Promise<void>;
