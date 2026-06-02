import type { GraphNode } from './graph-builder.js';
import type { ImportanceEntry } from './importance-analyzer.js';
export interface DeadCodeCandidate {
    id: string;
    path: string;
    kind: 'file' | 'export' | 'import' | 'duplicate-component';
    importance: number;
    lastCommitDate: string | null;
    testOnlyReferences: boolean;
    similarityScore?: number;
    pairedWith?: string;
}
export interface DeadCodeScanResult {
    candidates: DeadCodeCandidate[];
    summary: {
        unusedFiles: number;
        unusedExports: number;
        unusedImports: number;
        duplicateComponents: number;
    };
    warning?: string;
}
export declare function scanDeadCode(projectRoot: string, graphNodes: Map<string, GraphNode>, importanceScores: Record<string, ImportanceEntry>): Promise<DeadCodeScanResult>;
