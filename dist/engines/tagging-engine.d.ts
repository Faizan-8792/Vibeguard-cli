import type { GraphNode } from './graph-builder.js';
import type { ResolvedConfig } from '../storage/config-store.js';
export declare function computeTags(projectRoot: string, graphNodes: Map<string, GraphNode>, config: ResolvedConfig): Promise<Record<string, string[]>>;
export declare function loadTags(projectRoot: string): Promise<Record<string, string[]> | null>;
