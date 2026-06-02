import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeImportance } from '../../src/engines/importance-analyzer.js';
import { loadConfig } from '../../src/storage/config-store.js';
import type { GraphNode } from '../../src/engines/graph-builder.js';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Property 28: Importance Score Formula', () => {
  it('score equals weighted sum of dependents, imports, git, and route', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          dependents: fc.integer({ min: 0, max: 20 }),
          imports: fc.integer({ min: 0, max: 20 }),
        }),
        async ({ dependents, imports }) => {
          const dir = await mkdtemp(join(tmpdir(), 'vg-imp-'));
          await mkdir(join(dir, '.vibeguard'), { recursive: true });

          const graphNodes = new Map<string, GraphNode>();
          const depList = Array.from({ length: dependents }, (_, i) => `dep${i}.ts`);
          const impList = Array.from({ length: imports }, (_, i) => `imp${i}.ts`);

          graphNodes.set('src/target.ts', {
            file: 'src/target.ts',
            imports: impList,
            exports: ['x'],
            dependents: depList,
          });

          const config = await loadConfig(dir);
          const weights = config.importance.weights;
          const scores = await computeImportance(dir, graphNodes, config);

          const entry = scores['src/target.ts'];
          expect(entry).toBeDefined();

          // Git is 0 (no git repo), route is 0 (not a route file)
          const expectedScore =
            weights.dependents * dependents +
            weights.imports * imports +
            weights.git * 0 +
            weights.route * 0;

          expect(entry.score).toBe(expectedScore);
          expect(entry.dependents).toBe(dependents);
          expect(entry.imports).toBe(imports);

          await rm(dir, { recursive: true, force: true });
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe('Property 29: Route Usage Classification', () => {
  it('files matching route patterns get routeUsage=1', async () => {
    const routeFiles = [
      'pages/index.ts',
      'app/dashboard/page.tsx',
      'routes/home.ts',
      'src/pages/about.ts',
      'src/routes/api.ts',
    ];

    const dir = await mkdtemp(join(tmpdir(), 'vg-imp-'));
    await mkdir(join(dir, '.vibeguard'), { recursive: true });

    const graphNodes = new Map<string, GraphNode>();
    for (const file of routeFiles) {
      graphNodes.set(file, {
        file,
        imports: [],
        exports: ['default'],
        dependents: [],
      });
    }

    const config = await loadConfig(dir);
    const scores = await computeImportance(dir, graphNodes, config);

    for (const file of routeFiles) {
      expect(scores[file]?.routeUsage).toBe(1);
    }

    await rm(dir, { recursive: true, force: true });
  });

  it('non-route files get routeUsage=0', async () => {
    const nonRouteFiles = [
      'src/utils/helper.ts',
      'src/components/Button.tsx',
      'lib/db.ts',
    ];

    const dir = await mkdtemp(join(tmpdir(), 'vg-imp-'));
    await mkdir(join(dir, '.vibeguard'), { recursive: true });

    const graphNodes = new Map<string, GraphNode>();
    for (const file of nonRouteFiles) {
      graphNodes.set(file, {
        file,
        imports: [],
        exports: ['x'],
        dependents: [],
      });
    }

    const config = await loadConfig(dir);
    const scores = await computeImportance(dir, graphNodes, config);

    for (const file of nonRouteFiles) {
      expect(scores[file]?.routeUsage).toBe(0);
    }

    await rm(dir, { recursive: true, force: true });
  });
});
