import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeTags } from '../../src/engines/tagging-engine.js';
import { loadConfig } from '../../src/storage/config-store.js';
import type { GraphNode } from '../../src/engines/graph-builder.js';

describe('Tagging Engine', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `vibeguard-tag-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(testDir, 'src', 'components'), { recursive: true });
    await mkdir(join(testDir, 'pages', 'api'), { recursive: true });
    await mkdir(join(testDir, '.vibeguard'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('derives tags from file path', async () => {
    await writeFile(join(testDir, 'src', 'components', 'UserProfile.tsx'), 'export function UserProfile() {}', 'utf-8');

    const config = await loadConfig(testDir);
    const nodes = new Map<string, GraphNode>([
      ['src/components/UserProfile.tsx', { file: 'src/components/UserProfile.tsx', imports: [], exports: ['UserProfile'], dependents: [] }],
    ]);

    const tags = await computeTags(testDir, nodes, config);
    const fileTags = tags['src/components/UserProfile.tsx'];

    expect(fileTags).toContain('component');
    expect(fileTags.some((t) => t.includes('user'))).toBe(true);
    expect(fileTags.some((t) => t.includes('profile'))).toBe(true);
  });

  it('applies framework patterns for pages/api', async () => {
    await writeFile(join(testDir, 'pages', 'api', 'users.ts'), 'export default function handler() {}', 'utf-8');

    const config = await loadConfig(testDir);
    const nodes = new Map<string, GraphNode>([
      ['pages/api/users.ts', { file: 'pages/api/users.ts', imports: [], exports: ['default'], dependents: [] }],
    ]);

    const tags = await computeTags(testDir, nodes, config);
    const fileTags = tags['pages/api/users.ts'];

    expect(fileTags).toContain('api');
    expect(fileTags).toContain('route');
  });

  it('parses @vibeguard: comments', async () => {
    await writeFile(
      join(testDir, 'src', 'components', 'Button.tsx'),
      '// @vibeguard: ui, design-system\nexport function Button() {}',
      'utf-8'
    );

    const config = await loadConfig(testDir);
    const nodes = new Map<string, GraphNode>([
      ['src/components/Button.tsx', { file: 'src/components/Button.tsx', imports: [], exports: ['Button'], dependents: [] }],
    ]);

    const tags = await computeTags(testDir, nodes, config);
    const fileTags = tags['src/components/Button.tsx'];

    expect(fileTags).toContain('ui');
    expect(fileTags).toContain('design-system');
  });

  it('all tags match [a-z0-9-] pattern', async () => {
    await writeFile(
      join(testDir, 'src', 'components', 'MyComponent.tsx'),
      'export function MyComponent() {}',
      'utf-8'
    );

    const config = await loadConfig(testDir);
    const nodes = new Map<string, GraphNode>([
      ['src/components/MyComponent.tsx', { file: 'src/components/MyComponent.tsx', imports: [], exports: ['MyComponent'], dependents: [] }],
    ]);

    const tags = await computeTags(testDir, nodes, config);
    const fileTags = tags['src/components/MyComponent.tsx'];

    for (const tag of fileTags) {
      expect(tag).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('tags are sorted alphabetically and deduplicated', async () => {
    await writeFile(
      join(testDir, 'src', 'components', 'Button.tsx'),
      '// @vibeguard: button, component\nexport function Button() {}',
      'utf-8'
    );

    const config = await loadConfig(testDir);
    const nodes = new Map<string, GraphNode>([
      ['src/components/Button.tsx', { file: 'src/components/Button.tsx', imports: [], exports: ['Button'], dependents: [] }],
    ]);

    const tags = await computeTags(testDir, nodes, config);
    const fileTags = tags['src/components/Button.tsx'];

    // Check sorted
    const sorted = [...fileTags].sort();
    expect(fileTags).toEqual(sorted);

    // Check no duplicates
    const unique = [...new Set(fileTags)];
    expect(fileTags).toEqual(unique);
  });
});
