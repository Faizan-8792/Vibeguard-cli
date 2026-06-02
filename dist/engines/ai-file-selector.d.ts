import type { LLMCredentials } from '../storage/credentials-store.js';
import type { GraphNode } from './graph-builder.js';
export interface AIFileSelection {
    files: string[];
    reasoning: string;
    tokensUsed: number;
}
/**
 * Uses AI to select relevant files when local tag-matching returns no results.
 * This is the fallback for generic/casual prompts.
 * Only sends file names + tags (NOT file content) to keep token usage minimal.
 */
export declare function selectFilesWithAI(task: string, credentials: LLMCredentials, graphNodes: Map<string, GraphNode>, tags: Record<string, string[]>): Promise<AIFileSelection>;
