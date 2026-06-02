import type { LLMCredentials } from '../storage/credentials-store.js';
import type { AttackFinding } from './attack-scanner.js';
import type { SecurityIssue } from './security-scanner.js';
export interface FileFixPlan {
    file: string;
    issues: string[];
    originalContent: string;
    fixedContent: string;
    changed: boolean;
    explanation: string;
}
export interface AIFixResult {
    plans: FileFixPlan[];
    tokensUsed: number;
    model: string;
    applied: boolean;
    backupDir?: string;
}
/**
 * Generate fixes for the files referenced by the findings.
 * Processes one file per LLM call to keep context small and budget-friendly.
 */
export declare function generateFixes(projectRoot: string, credentials: LLMCredentials, attackFindings: AttackFinding[], securityIssues: SecurityIssue[], opts?: {
    maxFiles?: number;
    maxTokensPerFile?: number;
}): Promise<FileFixPlan[]>;
/**
 * Apply fix plans to disk. Backs up originals to .vibeguard-trash/ai-fix-<timestamp>/ first.
 */
export declare function applyFixes(projectRoot: string, plans: FileFixPlan[]): Promise<{
    applied: number;
    backupDir: string;
}>;
