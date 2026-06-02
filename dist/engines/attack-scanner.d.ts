import type { ResolvedConfig } from '../storage/config-store.js';
export type AttackSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export interface AttackFinding {
    id: string;
    category: string;
    attackType: string;
    severity: AttackSeverity;
    message: string;
    file: string;
    line: number;
    snippet?: string;
    recommendation: string;
}
export interface AttackScanResult {
    findings: AttackFinding[];
    counts: Record<AttackSeverity, number>;
    coverage: string[];
}
export declare function scanAttacks(projectRoot: string, files: string[], _config: ResolvedConfig): Promise<AttackScanResult>;
