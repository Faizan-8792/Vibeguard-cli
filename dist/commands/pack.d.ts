import type { CommandContext } from '../cli.js';
export interface PackCommandOptions {
    task: string;
    taskFile?: string;
    radius?: number;
    budget?: number;
    mode?: string;
}
export declare function runPack(ctx: CommandContext, opts: PackCommandOptions): Promise<void>;
