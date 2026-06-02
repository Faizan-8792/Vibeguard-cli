import type { GraphNode } from './graph-builder.js';
import type { ResolvedConfig } from '../storage/config-store.js';
export interface ImportanceEntry {
    score: number;
    dependents: number;
    imports: number;
    gitCommits: number;
    routeUsage: number;
}
export declare function computeImportance(projectRoot: string, graphNodes: Map<string, GraphNode>, config: ResolvedConfig): Promise<Record<string, ImportanceEntry>>;
export declare function loadImportance(projectRoot: string): Promise<Record<string, ImportanceEntry> | null>;
