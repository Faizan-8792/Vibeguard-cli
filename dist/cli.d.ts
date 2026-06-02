#!/usr/bin/env node
import { type Logger } from './utils/logger.js';
import { type ResolvedConfig } from './storage/config-store.js';
export { runCommand, generateContextForEditor, serializeContextPackageForAgent } from './api.js';
export interface GlobalOptions {
    json: boolean;
    cwd: string;
    include: string[];
    exclude: string[];
    config: string | undefined;
    verbose: boolean;
    quiet: boolean;
}
export interface CommandContext {
    options: GlobalOptions;
    config: ResolvedConfig;
    logger: Logger;
    projectRoot: string;
}
