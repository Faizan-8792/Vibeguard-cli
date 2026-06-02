import type { LLMCredentials } from '../storage/credentials-store.js';
import type { AttackFinding } from './attack-scanner.js';
import type { SecurityIssue } from './security-scanner.js';
export interface AIAdvisorResult {
    summary: string;
    additionalFindings: Array<{
        file: string;
        attackType: string;
        severity: string;
        description: string;
        fix: string;
    }>;
    prioritizedFixes: string[];
    tokensUsed: number;
    model: string;
}
export declare function runAIAdvisor(projectRoot: string, credentials: LLMCredentials, attackFindings: AttackFinding[], securityIssues: SecurityIssue[], opts?: {
    maxExcerptLines?: number;
    maxTokens?: number;
}): Promise<AIAdvisorResult>;
