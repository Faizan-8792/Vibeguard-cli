import type { CommandContext } from '../cli.js';
export interface InitOptions {
    force: boolean;
}
export declare function runInit(ctx: CommandContext, opts: InitOptions): Promise<void>;
