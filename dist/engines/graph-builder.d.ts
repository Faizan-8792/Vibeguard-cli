import type { ResolvedConfig } from '../storage/config-store.js';
import type { Logger } from '../utils/logger.js';
export interface GraphNode {
    file: string;
    imports: string[];
    exports: string[];
    dependents: string[];
}
export interface GraphData {
    schemaVersion: string;
    nodes: Record<string, GraphNode>;
}
export interface AnalysisMeta {
    schemaVersion: string;
    buildTimestamp: string;
    fileHashes: Record<string, string>;
    parseErrors: Array<{
        file: string;
        error: string;
    }>;
    warnings: string[];
}
export interface GraphBuildResult {
    nodes: Map<string, GraphNode>;
    summary: {
        nodes: number;
        edges: number;
        rebuilt: number;
        skipped: number;
    };
}
export declare function buildGraph(projectRoot: string, files: string[], config: ResolvedConfig, logger: Logger): Promise<GraphBuildResult>;
export declare function loadGraph(projectRoot: string): Promise<GraphData | null>;
