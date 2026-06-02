import type { CommandContext } from '../cli.js';
export interface TrashCommandOptions {
    action: string;
    target?: string;
    force: boolean;
    yes: boolean;
}
export declare function runTrash(ctx: CommandContext, opts: TrashCommandOptions): Promise<void>;
