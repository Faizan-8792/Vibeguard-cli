import type { CommandContext } from '../cli.js';
export declare function runInstall(ctx: CommandContext, opts: {
    platform: string;
}): Promise<void>;
export declare function runUninstall(ctx: CommandContext, opts: {
    platform: string;
}): Promise<void>;
