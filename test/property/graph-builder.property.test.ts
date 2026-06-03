import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildGraph, type GraphNode } from '../../src/engines/graph-builder.js';
import { loadConfig } from '../../src/storage/config-store.js';
import { createLogger } from '../../src/utils/logger.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const logger = createLogger({ jsonMode: true, quiet: true, verbose: false, command: 'test' });

async function createTempProject(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vg-graph-'));
  const srcDir = join(dir, 'src');
  await mkdir(srcDir, { recursive: true });
  await mkdir(join(dir, '.codescout'), { recursive: true });

  for (const [name, content] of Object.entries(files)) {
    const filePath = join(dir, name);
    await mkdir(join(filePath, '..'), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
  }

  // Write a minimal tsconfig
  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true },
    include: ['src/**/*'],
  }), 'utf-8');

  return dir;
}

describe('Property 7: Graph Node Shape Invariant', () => {
  it('every graph node has required fields: file, imports, exports, dependents', async () => {
    const dir = await createTempProject({
      'src/a.ts': 'export const x = 1;',
      'src/b.ts': 'import { x } from "./a.js";\nexport const y = x + 1;',
    });

    try {
      const config = await loadConfig(dir);
      const result = await buildGraph(dir, ['src/a.ts', 'src/b.ts'], config, logger);

      for (const [, node] of result.nodes) {
        expect(node).toHaveProperty('file');
        expect(node).toHaveProperty('imports');
        expect(node).toHaveProperty('exports');
        expect(node).toHaveProperty('dependents');
        expect(typeof node.file).toBe('string');
        expect(Array.isArray(node.imports)).toBe(true);
        expect(Array.isArray(node.exports)).toBe(true);
        expect(Array.isArray(node.dependents)).toBe(true);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Property 8: Incremental Rebuild Correctness', () => {
  it('unchanged files are skipped on second build', async () => {
    const dir = await createTempProject({
      'src/a.ts': 'export const x = 1;',
      'src/b.ts': 'export const y = 2;',
    });

    try {
      const config = await loadConfig(dir);
      const files = ['src/a.ts', 'src/b.ts'];

      // First build
      const result1 = await buildGraph(dir, files, config, logger);
      expect(result1.summary.rebuilt).toBe(2);
      expect(result1.summary.skipped).toBe(0);

      // Second build (no changes)
      const result2 = await buildGraph(dir, files, config, logger);
      expect(result2.summary.rebuilt).toBe(0);
      expect(result2.summary.skipped).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('modified files are rebuilt', async () => {
    const dir = await createTempProject({
      'src/a.ts': 'export const x = 1;',
      'src/b.ts': 'export const y = 2;',
    });

    try {
      const config = await loadConfig(dir);
      const files = ['src/a.ts', 'src/b.ts'];

      // First build
      await buildGraph(dir, files, config, logger);

      // Modify one file
      await writeFile(join(dir, 'src/a.ts'), 'export const x = 42;\nexport const z = 3;', 'utf-8');

      // Second build
      const result2 = await buildGraph(dir, files, config, logger);
      expect(result2.summary.rebuilt).toBe(1);
      expect(result2.summary.skipped).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Property 9: Import Resolution Classification', () => {
  it('relative imports resolve to internal project files', async () => {
    const dir = await createTempProject({
      'src/a.ts': 'export const x = 1;',
      'src/b.ts': 'import { x } from "./a.js";\nexport const y = x;',
    });

    try {
      const config = await loadConfig(dir);
      const result = await buildGraph(dir, ['src/a.ts', 'src/b.ts'], config, logger);
      const nodeB = result.nodes.get('src/b.ts');

      expect(nodeB).toBeDefined();
      // Relative imports should resolve to internal project paths (contain a slash)
      expect(nodeB!.imports.length).toBeGreaterThan(0);
      for (const imp of nodeB!.imports) {
        // Internal paths contain directory separators, bare packages don't
        expect(imp).toContain('/');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('bare package imports are excluded from graph', async () => {
    const dir = await createTempProject({
      'src/a.ts': 'import { readFile } from "node:fs/promises";\nimport path from "path";\nexport const x = 1;',
    });

    try {
      const config = await loadConfig(dir);
      const result = await buildGraph(dir, ['src/a.ts'], config, logger);
      const nodeA = result.nodes.get('src/a.ts');

      expect(nodeA).toBeDefined();
      // Bare imports (node:fs, path) should not appear in imports
      for (const imp of nodeA!.imports) {
        expect(imp).not.toMatch(/^node:/);
        expect(imp).not.toBe('path');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Property 10: Parse Error Resilience', () => {
  it('continues building graph when some files have syntax errors', async () => {
    const dir = await createTempProject({
      'src/good.ts': 'export const x = 1;',
      'src/bad.ts': 'export const y = {{{;', // Invalid syntax
    });

    try {
      const config = await loadConfig(dir);
      const result = await buildGraph(dir, ['src/good.ts', 'src/bad.ts'], config, logger);

      // Should still have at least the good file
      expect(result.nodes.size).toBeGreaterThanOrEqual(1);
      expect(result.nodes.has('src/good.ts')).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Property 6: Glob Exclusion Universality', () => {
  it('files matching skip set are never included in resolved files', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: fc.stringMatching(/^[a-z]{1,8}\.(ts|js)$/),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (fileSpecs) => {
          const dir = await mkdtemp(join(tmpdir(), 'vg-glob-'));
          const srcDir = join(dir, 'src');
          await mkdir(srcDir, { recursive: true });

          for (const spec of fileSpecs) {
            await writeFile(join(srcDir, spec.name), 'export const x = 1;', 'utf-8');
          }

          // Import resolveFiles
          const { resolveFiles } = await import('../../src/utils/glob-resolver.js');

          // Skip all .js files
          const results = await resolveFiles(dir, ['**/*.ts', '**/*.js'], ['**/*.js']);

          // No .js files should appear
          for (const file of results) {
            expect(file).not.toMatch(/\.js$/);
          }

          await rm(dir, { recursive: true, force: true });
        },
      ),
      { numRuns: 10 },
    );
  });
});
