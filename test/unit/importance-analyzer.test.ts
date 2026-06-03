import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeImportance } from '../../src/engines/importance-analyzer.js';
import { loadConfig } from '../../src/storage/config-store.js';
import type { GraphNode } from '../../src/engines/graph-builder.js';

describe('Importance Analyzer', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `codescout-imp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(testDir, '.codescout'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('computes score using formula: (dependents*w) + (imports*w) + (git*w) + (route*w)', async () => {
    const config = await loadConfig(testDir);
    const nodes = new Map<string, GraphNode>([
      ['src/index.ts', { file: 'src/index.ts', imports: ['src/a.ts', 'src/b.ts'], exports: ['main'], dependents: ['src/c.ts', 'src/d.ts', 'src/e.ts'] }],
    ]);

    const scores = await computeImportance(testDir, nodes, config);
    const entry = scores['src/index.ts'];

    expect(entry).toBeDefined();
    expect(entry.dependents).toBe(3);
    expect(entry.imports).toBe(2);
    // Score = 5*3 + 2*2 + 3*0 + 4*0 = 15 + 4 = 19 (no git, no route)
    expect(entry.score).toBe(19);
  });

  it('sets routeUsage=1 for route files', async () => {
    const config = await loadConfig(testDir);
    const nodes = new Map<string, GraphNode>([
      ['pages/api/users.ts', { file: 'pages/api/users.ts', imports: [], exports: ['default'], dependents: [] }],
    ]);

    const scores = await computeImportance(testDir, nodes, config);
    expect(scores['pages/api/users.ts'].routeUsage).toBe(1);
  });

  it('sets routeUsage=0 for non-route files', async () => {
    const config = await loadConfig(testDir);
    const nodes = new Map<string, GraphNode>([
      ['src/utils/helper.ts', { file: 'src/utils/helper.ts', imports: [], exports: ['helper'], dependents: [] }],
    ]);

    const scores = await computeImportance(testDir, nodes, config);
    expect(scores['src/utils/helper.ts'].routeUsage).toBe(0);
  });

  it('handles non-git repos gracefully', async () => {
    const config = await loadConfig(testDir);
    const nodes = new Map<string, GraphNode>([
      ['src/index.ts', { file: 'src/index.ts', imports: [], exports: [], dependents: [] }],
    ]);

    // Should not throw
    const scores = await computeImportance(testDir, nodes, config);
    expect(scores['src/index.ts'].gitCommits).toBe(0);
  });
});
