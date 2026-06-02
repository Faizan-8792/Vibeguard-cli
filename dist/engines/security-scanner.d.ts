import type { ResolvedConfig } from '../storage/config-store.js';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export interface SecurityIssue {
    id: string;
    category: string;
    severity: Severity;
    message: string;
    file: string;
    line: number;
    column?: number;
    snippet?: string;
    suggestedFix?: string;
}
export interface SecurityScanResult {
    issues: SecurityIssue[];
    counts: Record<Severity, number>;
}
export declare function scanSecurity(projectRoot: string, files: string[], config: ResolvedConfig): Promise<SecurityScanResult>;
