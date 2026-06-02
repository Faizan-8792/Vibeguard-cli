import type { CommandContext } from '../cli.js';
export interface ConfigCommandOptions {
    action: string;
    value?: string;
    provider?: string;
    model?: string;
    baseUrl?: string;
    test?: boolean;
}
export declare function runConfig(ctx: CommandContext, opts: ConfigCommandOptions): Promise<void>;
