import type { GraphNode } from './graph-builder.js';
import type { SelectedFile } from './context-radius-engine.js';
/**
 * Renders a beautiful ASCII dependency graph showing connections between selected files.
 * Uses box-drawing characters for a clean look.
 */
export declare function renderDependencyGraph(selectedFiles: SelectedFile[], graphNodes: Map<string, GraphNode>): string;
/**
 * Renders a compact summary of the graph structure for a set of files.
 */
export declare function renderGraphSummary(selectedFiles: SelectedFile[], graphNodes: Map<string, GraphNode>, task: string): string;
