/**
 * Flow analyzer — execution flows and deeper graph intelligence.
 *
 * Three capabilities, all pure over an already-built graph:
 *  1. Execution flows: trace call chains from entry points (routes, CLI, tests,
 *     main/index) and rank them by criticality.
 *  2. Bridge detection: approximate betweenness centrality to find architectural
 *     chokepoints — nodes that sit on many shortest paths.
 *  3. Knowledge gaps: isolated nodes, untested hotspots, and thin coupling.
 */
import type { GraphData, GraphNode } from './graph-builder.js';

export interface ExecutionFlow {
  entry: string;
  /** Files in the flow, in BFS order from the entry point. */
  members: string[];
  depth: number;
  /** Criticality = reachable size × entry-kind weight. */
  criticality: number;
  kind: string;
}

export interface BridgeNode {
  file: string;
  /** Approximate betweenness score (count of shortest paths passing through). */
  score: number;
}

export interface KnowledgeGaps {
  isolatedFiles: string[];
  untestedHotspots: Array<{ file: string; dependents: number }>;
  thinlyConnected: string[];
}

export interface FlowAnalysis {
  flows: ExecutionFlow[];
  bridges: BridgeNode[];
  gaps: KnowledgeGaps;
}

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(file) || /(^|\/)(__tests__|tests?)\//.test(file);
}

/** Classify a node as an entry point and return its criticality weight (0 = not an entry). */
function entryKind(node: GraphNode): { kind: string; weight: number } {
  const f = node.file.toLowerCase();
  if (isTestFile(f)) return { kind: 'test', weight: 1 };
  if (/(^|\/)(cli|main|index)\.[tj]sx?$/.test(f)) return { kind: 'entrypoint', weight: 5 };
  if (/(^|\/)(pages|app|routes?)\//.test(f)) return { kind: 'route', weight: 4 };
  if (/(^|\/)commands?\//.test(f)) return { kind: 'command', weight: 3 };
  // A node nobody imports but which imports others is a likely top-level entry.
  if (node.dependents.length === 0 && node.imports.length > 0) return { kind: 'orphan-entry', weight: 2 };
  return { kind: '', weight: 0 };
}

/** Trace the set of files reachable from an entry via import edges (forward BFS). */
function traceFlow(graph: GraphData, entry: string, maxDepth = 15): { members: string[]; depth: number } {
  const visited = new Set<string>([entry]);
  const members: string[] = [entry];
  let depth = 0;
  let frontier = [entry];

  while (frontier.length > 0 && depth < maxDepth) {
    const next: string[] = [];
    for (const file of frontier) {
      const node = graph.nodes[file];
      if (!node) continue;
      for (const imp of node.imports) {
        if (visited.has(imp) || !graph.nodes[imp]) continue;
        visited.add(imp);
        members.push(imp);
        next.push(imp);
      }
    }
    if (next.length > 0) depth++;
    frontier = next;
  }

  return { members, depth };
}

/** Detect execution flows from all entry points, sorted by criticality. */
export function detectFlows(graph: GraphData, limit = 50): ExecutionFlow[] {
  const flows: ExecutionFlow[] = [];

  for (const node of Object.values(graph.nodes)) {
    const { kind, weight } = entryKind(node);
    if (weight === 0) continue;

    const { members, depth } = traceFlow(graph, node.file);
    flows.push({
      entry: node.file,
      members,
      depth,
      criticality: members.length * weight,
      kind,
    });
  }

  return flows.sort((a, b) => b.criticality - a.criticality).slice(0, limit);
}

/**
 * Approximate betweenness centrality via sampled BFS shortest paths.
 * Counts, for each node, how many shortest paths between other node pairs run
 * through it. Sampling keeps it O(sample × E) rather than full O(V × E).
 */
export function detectBridges(graph: GraphData, topN = 10): BridgeNode[] {
  const files = Object.keys(graph.nodes);
  if (files.length === 0) return [];

  const through = new Map<string, number>();
  // Sample up to 60 source nodes for tractability on large graphs.
  const sampleSize = Math.min(files.length, 60);
  const step = Math.max(1, Math.floor(files.length / sampleSize));

  const neighbors = (file: string): string[] => {
    const node = graph.nodes[file];
    if (!node) return [];
    return [...node.imports, ...node.dependents].filter((n) => graph.nodes[n]);
  };

  for (let i = 0; i < files.length; i += step) {
    const source = files[i];
    // BFS recording predecessors for shortest-path reconstruction.
    const dist = new Map<string, number>([[source, 0]]);
    const prev = new Map<string, string | null>([[source, null]]);
    const queue = [source];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of neighbors(cur)) {
        if (!dist.has(nb)) {
          dist.set(nb, dist.get(cur)! + 1);
          prev.set(nb, cur);
          queue.push(nb);
        }
      }
    }

    // Walk each discovered target back to source, crediting intermediate nodes.
    for (const target of dist.keys()) {
      if (target === source) continue;
      let step2 = prev.get(target) ?? null;
      while (step2 && step2 !== source) {
        through.set(step2, (through.get(step2) ?? 0) + 1);
        step2 = prev.get(step2) ?? null;
      }
    }
  }

  return [...through.entries()]
    .map(([file, score]) => ({ file, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/** Identify structural weaknesses: isolated nodes, untested hotspots, thin coupling. */
export function detectKnowledgeGaps(graph: GraphData): KnowledgeGaps {
  const nodes = Object.values(graph.nodes);

  const isolatedFiles = nodes
    .filter((n) => n.imports.length === 0 && n.dependents.length === 0 && !isTestFile(n.file))
    .map((n) => n.file);

  const untestedHotspots = nodes
    .filter((n) => n.dependents.length >= 5 && !n.dependents.some(isTestFile))
    .sort((a, b) => b.dependents.length - a.dependents.length)
    .slice(0, 10)
    .map((n) => ({ file: n.file, dependents: n.dependents.length }));

  const thinlyConnected = nodes
    .filter((n) => !isTestFile(n.file) && n.imports.length + n.dependents.length === 1)
    .map((n) => n.file)
    .slice(0, 20);

  return { isolatedFiles, untestedHotspots, thinlyConnected };
}

/** Run all flow-analysis capabilities at once. */
export function analyzeFlows(graph: GraphData): FlowAnalysis {
  return {
    flows: detectFlows(graph),
    bridges: detectBridges(graph),
    gaps: detectKnowledgeGaps(graph),
  };
}

/** Find which flows are affected by a set of changed files (feeds review). */
export function affectedFlows(flows: ExecutionFlow[], changedFiles: string[]): ExecutionFlow[] {
  const changed = new Set(changedFiles);
  return flows.filter((flow) => flow.members.some((m) => changed.has(m)));
}
