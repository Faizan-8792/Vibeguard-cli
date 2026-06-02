import { describe, it, expect } from 'vitest';
import { detectFlows, detectBridges, detectKnowledgeGaps, affectedFlows } from '../../src/engines/flow-analyzer.js';
import type { GraphData } from '../../src/engines/graph-builder.js';

// cli.ts (entry) → commands/run.ts → engines/core.ts ; core has 2 dependents; orphan.ts isolated
function makeGraph(): GraphData {
  return {
    schemaVersion: '2.2.0',
    nodes: {
      'src/cli.ts': { file: 'src/cli.ts', imports: ['src/commands/run.ts'], exports: ['main'], dependents: [], edges: [] },
      'src/commands/run.ts': { file: 'src/commands/run.ts', imports: ['src/engines/core.ts'], exports: ['run'], dependents: ['src/cli.ts'], edges: [] },
      'src/engines/core.ts': { file: 'src/engines/core.ts', imports: [], exports: ['core'], dependents: ['src/commands/run.ts', 'src/commands/other.ts'], edges: [] },
      'src/commands/other.ts': { file: 'src/commands/other.ts', imports: ['src/engines/core.ts'], exports: ['other'], dependents: [], edges: [] },
      'src/orphan.ts': { file: 'src/orphan.ts', imports: [], exports: ['orphan'], dependents: [], edges: [] },
    },
  } as unknown as GraphData;
}

describe('detectFlows', () => {
  it('detects entry points and traces reachable members', () => {
    const flows = detectFlows(makeGraph());
    const cliFlow = flows.find((f) => f.entry === 'src/cli.ts');
    expect(cliFlow).toBeDefined();
    expect(cliFlow!.kind).toBe('entrypoint');
    expect(cliFlow!.members).toContain('src/commands/run.ts');
    expect(cliFlow!.members).toContain('src/engines/core.ts');
  });

  it('sorts flows by descending criticality', () => {
    const flows = detectFlows(makeGraph());
    for (let i = 1; i < flows.length; i++) {
      expect(flows[i - 1].criticality).toBeGreaterThanOrEqual(flows[i].criticality);
    }
  });
});

describe('detectBridges', () => {
  it('identifies chokepoint nodes on shortest paths', () => {
    const bridges = detectBridges(makeGraph(), 5);
    // core.ts sits between the two command files → should score as a bridge
    expect(bridges.length).toBeGreaterThan(0);
    expect(bridges.map((b) => b.file)).toContain('src/engines/core.ts');
  });
});

describe('detectKnowledgeGaps', () => {
  it('finds isolated files', () => {
    const gaps = detectKnowledgeGaps(makeGraph());
    expect(gaps.isolatedFiles).toContain('src/orphan.ts');
  });

  it('finds untested hotspots (heavily depended on, no test coverage)', () => {
    // Build a graph where a file has >=5 dependents and none are tests
    const nodes: Record<string, unknown> = {
      'src/hot.ts': { file: 'src/hot.ts', imports: [], exports: ['hot'], dependents: ['a', 'b', 'c', 'd', 'e'], edges: [] },
    };
    for (const d of ['a', 'b', 'c', 'd', 'e']) {
      nodes[d] = { file: d, imports: ['src/hot.ts'], exports: [], dependents: [], edges: [] };
    }
    const graph = { schemaVersion: '2.2.0', nodes } as unknown as GraphData;
    const gaps = detectKnowledgeGaps(graph);
    expect(gaps.untestedHotspots.some((h) => h.file === 'src/hot.ts')).toBe(true);
  });
});

describe('affectedFlows', () => {
  it('returns flows whose members include a changed file', () => {
    const flows = detectFlows(makeGraph());
    const affected = affectedFlows(flows, ['src/engines/core.ts']);
    expect(affected.length).toBeGreaterThan(0);
    expect(affected.every((f) => f.members.includes('src/engines/core.ts'))).toBe(true);
  });

  it('returns nothing when no flow touches the changed files', () => {
    const flows = detectFlows(makeGraph());
    expect(affectedFlows(flows, ['src/orphan.ts'])).toEqual([]);
  });
});
