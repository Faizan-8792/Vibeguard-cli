import type { GraphNode } from './graph-builder.js';
import type { ImportanceWeights, ResolvedConfig } from '../storage/config-store.js';
import { createGitUtils } from '../utils/git-utils.js';
import { FileStoreImpl } from '../storage/file-store.js';

export interface ImportanceEntry {
  score: number;
  dependents: number;
  imports: number;
  gitCommits: number;
  routeUsage: number;
}

interface ImportanceData {
  schemaVersion: string;
  scores: Record<string, ImportanceEntry>;
}

const ROUTE_PATTERNS = [
  /^pages\//,
  /^app\/.*\/page\.(ts|tsx|js|jsx)$/,
  /^routes\//,
  /^src\/pages\//,
  /^src\/routes\//,
];

export async function computeImportance(
  projectRoot: string,
  graphNodes: Map<string, GraphNode>,
  config: ResolvedConfig
): Promise<Record<string, ImportanceEntry>> {
  const weights: ImportanceWeights = config.importance.weights;
  const gitUtils = createGitUtils();
  const isGit = await gitUtils.isGitRepo(projectRoot);
  const store = new FileStoreImpl(projectRoot);

  const scores: Record<string, ImportanceEntry> = {};
  const warnings: string[] = [];

  if (!isGit) {
    warnings.push('Git repository not detected; git_commit_frequency set to 0 for all files');
  }

  for (const [filePath, node] of graphNodes) {
    let gitCommits = 0;
    if (isGit) {
      gitCommits = await gitUtils.getCommitFrequency(filePath, 90, projectRoot);
    }

    const routeUsage = isRouteFile(filePath) ? 1 : 0;

    const score =
      weights.dependents * node.dependents.length +
      weights.imports * node.imports.length +
      weights.git * gitCommits +
      weights.route * routeUsage;

    scores[filePath] = {
      score,
      dependents: node.dependents.length,
      imports: node.imports.length,
      gitCommits,
      routeUsage,
    };
  }

  const data: ImportanceData = { schemaVersion: '1.0.0', scores };
  await store.write('importance.json', data);

  return scores;
}

function isRouteFile(filePath: string): boolean {
  return ROUTE_PATTERNS.some((pattern) => pattern.test(filePath));
}

export async function loadImportance(projectRoot: string): Promise<Record<string, ImportanceEntry> | null> {
  const store = new FileStoreImpl(projectRoot);
  const data = await store.read<ImportanceData>('importance.json');
  if (data && data.schemaVersion === '1.0.0') {
    return data.scores;
  }
  return null;
}
