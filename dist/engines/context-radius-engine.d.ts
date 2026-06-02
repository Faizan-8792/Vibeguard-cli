import type { GraphNode } from './graph-builder.js';
import type { ImportanceEntry } from './importance-analyzer.js';
import type { ResolvedConfig } from '../storage/config-store.js';
import { type CostEstimate } from './cost-estimator.js';
export interface SelectedFile {
    path: string;
    tags: string[];
    importance: number;
    role: string;
    hopDistance: number;
    matchScore: number;
}
export interface ContextSelectionResult {
    selectedFiles: SelectedFile[];
    tokenEstimates: CostEstimate;
    costEstimates: Record<string, {
        tokens: number;
        usd: number;
    }>;
}
export type PackMode = 'feature' | 'bugfix' | 'refactor';
export declare function selectContext(projectRoot: string, task: string, graphNodes: Map<string, GraphNode>, tags: Record<string, string[]>, importanceScores: Record<string, ImportanceEntry>, config: ResolvedConfig, opts: {
    radius?: number;
    budget?: number;
    mode?: PackMode;
}): Promise<ContextSelectionResult>;
