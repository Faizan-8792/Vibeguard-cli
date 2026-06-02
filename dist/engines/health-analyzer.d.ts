import { type SecurityIssue } from './security-scanner.js';
import type { ResolvedConfig } from '../storage/config-store.js';
export interface HealthResult {
    summary: {
        projectHealth: number;
        security: number | null;
        deadCode: number | null;
        architecture: number | null;
        contextEfficiency: number | null;
    };
    issues: SecurityIssue[];
    warnings: string[];
}
export declare function analyzeHealth(config: ResolvedConfig, projectRoot: string): Promise<HealthResult>;
