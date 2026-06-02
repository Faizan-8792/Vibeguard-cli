import type { SelectedFile } from './context-radius-engine.js';
import type { CostEstimate } from './cost-estimator.js';
import type { SecurityIssue } from './security-scanner.js';
import type { GraphData } from './graph-builder.js';
export interface ContextPackage {
    schemaVersion: string;
    task: string;
    detectedStack: string[];
    selectedFiles: SelectedFile[];
    warnings: string[];
    tokenBudget: {
        pointEstimate: number;
        range: {
            low: number;
            high: number;
        };
        reductionPercent: number;
    };
}
export declare function generateContextPackage(task: string, selectedFiles: SelectedFile[], tokenEstimates: CostEstimate, totalProjectTokens: number, projectRoot: string, graphData?: GraphData, securityIssues?: SecurityIssue[]): Promise<ContextPackage>;
