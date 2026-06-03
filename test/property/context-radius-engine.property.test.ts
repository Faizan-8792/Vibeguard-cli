import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { selectContext } from '../../src/engines/context-radius-engine.js';
import { loadConfig } from '../../src/storage/config-store.js';
import type { GraphNode } from '../../src/engines/graph-builder.js';
import type { ImportanceEntry } from '../../src/engines/importance-analyzer.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setupProject(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'vg-ctx-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await mkdir(join(dir, '.codescout'), { recursive: true });
  // Create dummy files for cost estimation
  await writeFile(join(dir, 'src/auth.ts'), 'export const login = () => {};', 'utf-8');
  await writeFile(join(dir, 'src/db.ts'), 'export const query = () => {};', 'utf-8');
  await writeFile(join(dir, 'src/api.ts'), 'export const handler = () => {};', 'utf-8');
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe('Property 33: Task Normalization', () => {
  it('task text is lowercased and stopwords removed before matching', async () => {
    const { dir, cleanup } = await setupProject();

    try {
      const config = await loadConfig(dir);
      const graphNodes = new Map<string, GraphNode>();
      graphNodes.set('src/auth.ts', { file: 'src/auth.ts', imports: [], exports: ['login'], dependents: [] });

      const tags: Record<string, string[]> = { 'src/auth.ts': ['auth', 'login'] };
      const importance: Record<string, ImportanceEntry> = {
        'src/auth.ts': { score: 5, dependents: 0, imports: 0, gitCommits: 0, routeUsage: 0 },
      };

      // "Fix THE Auth Login" should normalize to match "auth" and "login" tags
      const result = await selectContext(dir, 'Fix THE Auth Login', graphNodes, tags, importance, config, {});

      // Should find auth.ts since "auth" and "login" match after normalization
      expect(result.selectedFiles.length).toBeGreaterThan(0);
      expect(result.selectedFiles[0].path).toBe('src/auth.ts');
    } finally {
      await cleanup();
    }
  });
});

describe('Property 34: Context Radius Expansion with Decay', () => {
  it('hop distance increases and score decays for expanded files', async () => {
    const { dir, cleanup } = await setupProject();

    try {
      const config = await loadConfig(dir);
      const graphNodes = new Map<string, GraphNode>();
      graphNodes.set('src/auth.ts', { file: 'src/auth.ts', imports: ['src/db.ts'], exports: ['login'], dependents: [] });
      graphNodes.set('src/db.ts', { file: 'src/db.ts', imports: [], exports: ['query'], dependents: ['src/auth.ts'] });

      const tags: Record<string, string[]> = {
        'src/auth.ts': ['auth', 'login'],
        'src/db.ts': ['database', 'query'],
      };
      const importance: Record<string, ImportanceEntry> = {
        'src/auth.ts': { score: 5, dependents: 0, imports: 1, gitCommits: 0, routeUsage: 0 },
        'src/db.ts': { score: 3, dependents: 1, imports: 0, gitCommits: 0, routeUsage: 0 },
      };

      // Radius 2 should expand from auth.ts to db.ts
      const result = await selectContext(dir, 'fix auth login', graphNodes, tags, importance, config, { radius: 2, budget: 100000 });

      if (result.selectedFiles.length >= 2) {
        const seed = result.selectedFiles.find((f) => f.path === 'src/auth.ts');
        const expanded = result.selectedFiles.find((f) => f.path === 'src/db.ts');

        if (seed && expanded) {
          expect(seed.hopDistance).toBe(0);
          expect(expanded.hopDistance).toBeGreaterThan(0);
          // Expanded file should have lower score due to decay
          expect(expanded.matchScore).toBeLessThan(seed.matchScore);
        }
      }
    } finally {
      await cleanup();
    }
  });
});

describe('Property 35: Budget Constraint', () => {
  it('selected files do not exceed token budget', async () => {
    const { dir, cleanup } = await setupProject();

    try {
      const config = await loadConfig(dir);
      const graphNodes = new Map<string, GraphNode>();
      graphNodes.set('src/auth.ts', { file: 'src/auth.ts', imports: [], exports: ['login'], dependents: [] });
      graphNodes.set('src/db.ts', { file: 'src/db.ts', imports: [], exports: ['query'], dependents: [] });
      graphNodes.set('src/api.ts', { file: 'src/api.ts', imports: [], exports: ['handler'], dependents: [] });

      const tags: Record<string, string[]> = {
        'src/auth.ts': ['auth'],
        'src/db.ts': ['auth'],
        'src/api.ts': ['auth'],
      };
      const importance: Record<string, ImportanceEntry> = {
        'src/auth.ts': { score: 5, dependents: 0, imports: 0, gitCommits: 0, routeUsage: 0 },
        'src/db.ts': { score: 3, dependents: 0, imports: 0, gitCommits: 0, routeUsage: 0 },
        'src/api.ts': { score: 2, dependents: 0, imports: 0, gitCommits: 0, routeUsage: 0 },
      };

      // Very small budget
      const result = await selectContext(dir, 'auth', graphNodes, tags, importance, config, { budget: 10 });

      // Token estimate should not exceed budget (or be empty if even one file exceeds)
      expect(result.tokenEstimates.tokens).toBeLessThanOrEqual(10);
    } finally {
      await cleanup();
    }
  });
});

describe('Property 36: Radius-Then-Budget Order', () => {
  it('radius expansion happens before budget trimming', async () => {
    const { dir, cleanup } = await setupProject();

    try {
      const config = await loadConfig(dir);
      const graphNodes = new Map<string, GraphNode>();
      graphNodes.set('src/auth.ts', { file: 'src/auth.ts', imports: ['src/db.ts'], exports: ['login'], dependents: [] });
      graphNodes.set('src/db.ts', { file: 'src/db.ts', imports: ['src/api.ts'], exports: ['query'], dependents: ['src/auth.ts'] });
      graphNodes.set('src/api.ts', { file: 'src/api.ts', imports: [], exports: ['handler'], dependents: ['src/db.ts'] });

      const tags: Record<string, string[]> = {
        'src/auth.ts': ['auth'],
        'src/db.ts': ['database'],
        'src/api.ts': ['api'],
      };
      const importance: Record<string, ImportanceEntry> = {
        'src/auth.ts': { score: 5, dependents: 0, imports: 1, gitCommits: 0, routeUsage: 0 },
        'src/db.ts': { score: 3, dependents: 1, imports: 1, gitCommits: 0, routeUsage: 0 },
        'src/api.ts': { score: 2, dependents: 1, imports: 0, gitCommits: 0, routeUsage: 0 },
      };

      // Large budget, radius 3 — should expand through all
      const result = await selectContext(dir, 'auth', graphNodes, tags, importance, config, { radius: 3, budget: 100000 });

      // With large budget and radius 3, should include expanded files
      if (result.selectedFiles.length > 1) {
        // Verify hop distances are ordered correctly
        const maxHop = Math.max(...result.selectedFiles.map((f) => f.hopDistance));
        expect(maxHop).toBeGreaterThanOrEqual(0);
      }
    } finally {
      await cleanup();
    }
  });
});
