/**
 * Change detector — risk-scored review of a git diff.
 *
 * Maps changed files to their blast radius (transitive dependents through the
 * graph), scores each change by risk, flags test-coverage gaps, and — uniquely
 * to VibeGuard — folds in security/attack findings on the changed files. This
 * is the "code review" pillar that pairs the graph intelligence of
 * code-review-graph with VibeGuard's security moat.
 *
 * Pure analysis over an already-built graph: zero file reads beyond the diff,
 * zero tokens.
 */
import type { GraphData, GraphNode } from './graph-builder.js';
import type { ImportanceEntry } from './importance-analyzer.js';
import type { SecurityIssue } from './security-scanner.js';

export interface ReviewItem {
  file: string;
  /** Risk score (higher = review first). */
  risk: number;
  /** Number of files transitively affected by this change. */
  blastRadius: number;
  /** Importance score of the changed file (0 if unknown). */
  importance: number;
  /** True when nothing in the project tests/depends on this file. */
  isolated: boolean;
  /** True when no test file references this file. */
  testGap: boolean;
  /** Security/attack issue count located in this file. */
  securityIssues: number;
}

export interface ChangeReviewResult {
  base: string;
  changedFiles: string[];
  /** Changed files that are not in the graph (new/untracked or excluded). */
  unknownFiles: string[];
  reviewItems: ReviewItem[];
  /** Union of all transitively affected files (the full blast radius). */
  affectedFiles: string[];
  summary: {
    changed: number;
    affected: number;
    highRisk: number;
    testGaps: number;
    securityIssues: number;
  };
  /** Token-savings accounting vs reading the whole project. */
  contextSavings: {
    estimated: true;
    fullContextTokens: number;
    graphContextTokens: number;
    savedTokens: number;
    savedPercent: number;
  };
}

const TOKENS_PER_GRAPH_NODE = 200;
const TOKENS_PER_FILE_CONTENT = 1500;

/** Is this file path a test/spec file? */
function isTestFile(file: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(file) || /(^|\/)(__tests__|test|tests)\//.test(file);
}

/**
 * Compute the blast radius of a seed file: all transitive dependents up to
 * `depth` hops, walking the inverse-import (dependents) edges.
 */
function blastRadius(graph: GraphData, seed: string, depth: number): Set<string> {
  const reached = new Set<string>();
  let frontier: Array<{ file: string; d: number }> = [{ file: seed, d: 0 }];

  while (frontier.length > 0) {
    const next: Array<{ file: string; d: number }> = [];
    for (const { file, d } of frontier) {
      if (d >= depth) continue;
      const node = graph.nodes[file];
      if (!node) continue;
      for (const dep of node.dependents) {
        if (reached.has(dep) || !graph.nodes[dep]) continue;
        reached.add(dep);
        next.push({ file: dep, d: d + 1 });
      }
    }
    frontier = next;
  }
  return reached;
}

/** Does any test file depend on this file (directly)? */
function hasTestCoverage(graph: GraphData, file: string): boolean {
  const node = graph.nodes[file];
  if (!node) return false;
  return node.dependents.some(isTestFile);
}

export interface DetectChangesInput {
  graph: GraphData;
  changedFiles: string[];
  base: string;
  depth?: number;
  importance?: Record<string, ImportanceEntry>;
  /** Security + attack issues across the project (filtered to changed files). */
  securityIssues?: SecurityIssue[];
}

/**
 * Run the risk-scored change analysis. Deterministic and pure — all inputs are
 * passed in so it is trivially testable.
 */
export function detectChanges(input: DetectChangesInput): ChangeReviewResult {
  const { graph, changedFiles, base } = input;
  const depth = input.depth ?? 2;
  const importance = input.importance ?? {};
  const issues = input.securityIssues ?? [];

  const issuesByFile = new Map<string, number>();
  for (const issue of issues) {
    const key = issue.file.replace(/\\/g, '/');
    issuesByFile.set(key, (issuesByFile.get(key) ?? 0) + 1);
  }

  const known = changedFiles.filter((f) => graph.nodes[f]);
  const unknownFiles = changedFiles.filter((f) => !graph.nodes[f]);

  const allAffected = new Set<string>();
  const reviewItems: ReviewItem[] = [];

  for (const file of known) {
    const radius = blastRadius(graph, file, depth);
    for (const r of radius) allAffected.add(r);

    const node: GraphNode = graph.nodes[file];
    const imp = importance[file]?.score ?? 0;
    const testGap = !hasTestCoverage(graph, file);
    const isolated = node.dependents.length === 0;
    const securityIssues = issuesByFile.get(file) ?? 0;

    // Risk = blast radius (capped) + importance contribution + test-gap penalty
    // + heavy weight on security issues touching the changed file.
    const risk =
      Math.min(radius.size, 50) +
      Math.min(imp, 50) +
      (testGap ? 10 : 0) +
      securityIssues * 25;

    reviewItems.push({
      file,
      risk,
      blastRadius: radius.size,
      importance: imp,
      isolated,
      testGap,
      securityIssues,
    });
  }

  reviewItems.sort((a, b) => b.risk - a.risk);

  const affectedFiles = [...allAffected];
  const totalNodes = Object.keys(graph.nodes).length;
  const graphContextTokens = (known.length + affectedFiles.length) * TOKENS_PER_GRAPH_NODE;
  const fullContextTokens = totalNodes * TOKENS_PER_FILE_CONTENT;
  const savedTokens = Math.max(0, fullContextTokens - graphContextTokens);
  const savedPercent = fullContextTokens > 0 ? Math.round((savedTokens / fullContextTokens) * 100) : 0;

  const totalSecurityIssues = reviewItems.reduce((sum, r) => sum + r.securityIssues, 0);

  return {
    base,
    changedFiles,
    unknownFiles,
    reviewItems,
    affectedFiles,
    summary: {
      changed: changedFiles.length,
      affected: affectedFiles.length,
      highRisk: reviewItems.filter((r) => r.risk >= 30).length,
      testGaps: reviewItems.filter((r) => r.testGap).length,
      securityIssues: totalSecurityIssues,
    },
    contextSavings: {
      estimated: true,
      fullContextTokens,
      graphContextTokens,
      savedTokens,
      savedPercent,
    },
  };
}
