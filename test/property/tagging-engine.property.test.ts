import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeTags } from '../../src/engines/tagging-engine.js';
import { loadConfig } from '../../src/storage/config-store.js';
import type { GraphNode } from '../../src/engines/graph-builder.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TAG_REGEX = /^[a-z0-9-]+$/;

describe('Property 25: Tag Format Invariant', () => {
  it('all generated tags match ^[a-z0-9-]+$ and are sorted alphabetically', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: fc.stringMatching(/^[a-z]{2,8}\.(ts|tsx|js)$/),
            content: fc.stringMatching(/^export const [a-zA-Z]+ = [0-9]+;$/),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (fileSpecs) => {
          const dir = await mkdtemp(join(tmpdir(), 'vg-tag-'));
          await mkdir(join(dir, 'src'), { recursive: true });
          await mkdir(join(dir, '.vibeguard'), { recursive: true });

          const graphNodes = new Map<string, GraphNode>();

          for (const spec of fileSpecs) {
            const filePath = `src/${spec.name}`;
            await writeFile(join(dir, filePath), spec.content, 'utf-8');
            graphNodes.set(filePath, {
              file: filePath,
              imports: [],
              exports: ['default'],
              dependents: [],
            });
          }

          const config = await loadConfig(dir);
          const tags = await computeTags(dir, graphNodes, config);

          for (const [, fileTags] of Object.entries(tags)) {
            for (const tag of fileTags) {
              expect(tag).toMatch(TAG_REGEX);
            }
            // Verify sorted
            const sorted = [...fileTags].sort();
            expect(fileTags).toEqual(sorted);
            // Verify no duplicates
            const unique = [...new Set(fileTags)];
            expect(fileTags).toEqual(unique);
          }

          await rm(dir, { recursive: true, force: true });
        },
      ),
      { numRuns: 10 },
    );
  });
});

describe('Property 26: Tag Derivation from Identifiers', () => {
  it('exported identifiers produce tags from their camelCase parts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-tag-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    await mkdir(join(dir, '.vibeguard'), { recursive: true });

    await writeFile(join(dir, 'src/myComponent.ts'), 'export function handleUserLogin() { return true; }', 'utf-8');

    const graphNodes = new Map<string, GraphNode>();
    graphNodes.set('src/myComponent.ts', {
      file: 'src/myComponent.ts',
      imports: [],
      exports: ['handleUserLogin'],
      dependents: [],
    });

    const config = await loadConfig(dir);
    const tags = await computeTags(dir, graphNodes, config);
    const fileTags = tags['src/myComponent.ts'] ?? [];

    // Should contain parts derived from "handleUserLogin" and "myComponent"
    expect(fileTags.some((t) => t === 'handle' || t === 'user' || t === 'login')).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });
});

describe('Property 27: Framework Pattern Tag Assignment', () => {
  it('files in pages/api/ get api and route tags', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-tag-'));
    await mkdir(join(dir, 'pages', 'api'), { recursive: true });
    await mkdir(join(dir, '.vibeguard'), { recursive: true });

    await writeFile(join(dir, 'pages/api/users.ts'), 'export default function handler() {}', 'utf-8');

    const graphNodes = new Map<string, GraphNode>();
    graphNodes.set('pages/api/users.ts', {
      file: 'pages/api/users.ts',
      imports: [],
      exports: ['default'],
      dependents: [],
    });

    const config = await loadConfig(dir);
    const tags = await computeTags(dir, graphNodes, config);
    const fileTags = tags['pages/api/users.ts'] ?? [];

    expect(fileTags).toContain('api');
    expect(fileTags).toContain('route');

    await rm(dir, { recursive: true, force: true });
  });

  it('files in components/ get component tag', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-tag-'));
    await mkdir(join(dir, 'src', 'components'), { recursive: true });
    await mkdir(join(dir, '.vibeguard'), { recursive: true });

    await writeFile(join(dir, 'src/components/Button.tsx'), 'export function Button() { return null; }', 'utf-8');

    const graphNodes = new Map<string, GraphNode>();
    graphNodes.set('src/components/Button.tsx', {
      file: 'src/components/Button.tsx',
      imports: [],
      exports: ['Button'],
      dependents: [],
    });

    const config = await loadConfig(dir);
    const tags = await computeTags(dir, graphNodes, config);
    const fileTags = tags['src/components/Button.tsx'] ?? [];

    expect(fileTags).toContain('component');

    await rm(dir, { recursive: true, force: true });
  });
});
