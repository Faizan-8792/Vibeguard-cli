import { type PackMode } from './engines/context-radius-engine.js';
import { type ContextPackage } from './engines/context-package-generator.js';
export type { ContextPackage } from './engines/context-package-generator.js';
export type { PackMode } from './engines/context-radius-engine.js';
export declare function runCommand(name: string, args: string[], options?: {
    cwd?: string;
    config?: string;
}): Promise<unknown>;
export declare function generateContextForEditor(task: string, options?: {
    radius?: number;
    budget?: number;
    mode?: PackMode;
    cwd?: string;
}): Promise<ContextPackage>;
export declare function serializeContextPackageForAgent(pkg: ContextPackage): string;
