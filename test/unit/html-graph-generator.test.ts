import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateHTMLGraph } from '../../src/engines/html-graph-generator.js';
import type { GraphData } from '../../src/engines/graph-builder.js';

function makeGraph(): GraphData {
  return {
    schemaVersion: '2.2.0',
    nodes: {
      'src/cli.ts': { file: 'src/cli.ts', imports: ['src/engines/core.ts'], exports: ['main'], dependents: [], edges: [] },
      'src/engines/core.ts': { file: 'src/engines/core.ts', imports: [], exports: ['core'], dependents: ['src/cli.ts'], edges: [] },
    },
  } as unknown as GraphData;
}

let tmp: string | null = null;
afterEach(async () => {
  if (tmp) { await rm(tmp, { recursive: true, force: true }); tmp = null; }
});

describe('generateHTMLGraph (3D)', () => {
  it('writes a self-contained HTML file and returns its path', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'vg-graph-'));
    const out = join(tmp, 'graph.html');
    const result = await generateHTMLGraph(tmp, makeGraph(), out);
    expect(result).toBe(out);
    const html = await readFile(out, 'utf-8');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('uses the 3d-force-graph WebGL renderer (not vis-network)', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'vg-graph-'));
    const out = join(tmp, 'graph.html');
    await generateHTMLGraph(tmp, makeGraph(), out);
    const html = await readFile(out, 'utf-8');
    expect(html).toContain('3d-force-graph');
    expect(html).toContain('ForceGraph3D');
    expect(html).not.toContain('vis-network');
  });

  it('disables auto-rotation and node-drag, enables zoom + orbit', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'vg-graph-'));
    const out = join(tmp, 'graph.html');
    await generateHTMLGraph(tmp, makeGraph(), out);
    const html = await readFile(out, 'utf-8');
    expect(html).toContain('autoRotate = false');
    expect(html).toContain('enableZoom = true');
    expect(html).toContain('enableRotate = true');
    expect(html).toContain('enableNodeDrag(false)');
    // settles then freezes — no perpetual drift
    expect(html).toContain('cooldownTicks');
  });

  it('embeds nodes and links derived from the graph', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'vg-graph-'));
    const out = join(tmp, 'graph.html');
    await generateHTMLGraph(tmp, makeGraph(), out);
    const html = await readFile(out, 'utf-8');
    expect(html).toContain('src/cli.ts');
    expect(html).toContain('src/engines/core.ts');
    // the import edge cli → core should be present as a link
    expect(html).toContain('"source":"src/cli.ts"');
  });

  it('renders an empty-state hint when there are no nodes', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'vg-graph-'));
    const out = join(tmp, 'graph.html');
    const empty = { schemaVersion: '2.2.0', nodes: {} } as unknown as GraphData;
    await generateHTMLGraph(tmp, empty, out);
    const html = await readFile(out, 'utf-8');
    expect(html).toContain('vibeguard map');
  });
});
