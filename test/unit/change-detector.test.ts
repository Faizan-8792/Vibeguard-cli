import { describe, it, expect } from 'vitest';
import { detectChanges } from '../../src/engines/change-detector.js';
import type { GraphData } from '../../src/engines/graph-builder.js';
import type { SecurityIssue } from '../../src/engines/security-scanner.js';

// auth.ts <- service.ts <- route.ts ; auth.ts also has a test
function makeGraph(): GraphData {
  return {
    schemaVersion: '2.2.0',
    nodes: {
      'src/auth.ts': { file: 'src/auth.ts', imports: [], exports: ['auth'], dependents: ['src/service.ts', 'src/auth.test.ts'], edges: [] },
      'src/service.ts': { file: 'src/service.ts', imports: ['src/auth.ts'], exports: ['service'], dependents: ['src/route.ts'], edges: [] },
      'src/route.ts': { file: 'src/route.ts', imports: ['src/service.ts'], exports: ['route'], dependents: [], edges: [] },
      'src/auth.test.ts': { file: 'src/auth.test.ts', imports: ['src/auth.ts'], exports: [], dependents: [], edges: [] },
      'src/lonely.ts': { file: 'src/lonely.ts', imports: [], exports: ['lonely'], dependents: [], edges: [] },
    },
  } as unknown as GraphData;
}

describe('detectChanges', () => {
  it('computes blast radius via transitive dependents', () => {
    const result = detectChanges({ graph: makeGraph(), changedFiles: ['src/auth.ts'], base: 'HEAD~1', depth: 3 });
    const item = result.reviewItems.find((r) => r.file === 'src/auth.ts');
    // dependents: service, auth.test → route (transitive). All reachable.
    expect(item?.blastRadius).toBeGreaterThanOrEqual(2);
    expect(result.affectedFiles).toContain('src/service.ts');
    expect(result.affectedFiles).toContain('src/route.ts');
  });

  it('flags test gaps when no test depends on a changed file', () => {
    const result = detectChanges({ graph: makeGraph(), changedFiles: ['src/service.ts'], base: 'HEAD~1' });
    const item = result.reviewItems.find((r) => r.file === 'src/service.ts');
    expect(item?.testGap).toBe(true);
  });

  it('does not flag a test gap when a test depends on the file', () => {
    const result = detectChanges({ graph: makeGraph(), changedFiles: ['src/auth.ts'], base: 'HEAD~1' });
    const item = result.reviewItems.find((r) => r.file === 'src/auth.ts');
    expect(item?.testGap).toBe(false);
  });

  it('marks isolated files', () => {
    const result = detectChanges({ graph: makeGraph(), changedFiles: ['src/lonely.ts'], base: 'HEAD~1' });
    const item = result.reviewItems.find((r) => r.file === 'src/lonely.ts');
    expect(item?.isolated).toBe(true);
    expect(item?.blastRadius).toBe(0);
  });

  it('folds in security issues and boosts their risk', () => {
    const issues: SecurityIssue[] = [
      { id: 'SEC-001-x', category: 'hard-coded-secret', severity: 'critical', message: 'key', file: 'src/auth.ts', line: 1 },
    ] as unknown as SecurityIssue[];
    const withSec = detectChanges({ graph: makeGraph(), changedFiles: ['src/auth.ts'], base: 'HEAD~1', securityIssues: issues });
    const withoutSec = detectChanges({ graph: makeGraph(), changedFiles: ['src/auth.ts'], base: 'HEAD~1' });
    const a = withSec.reviewItems.find((r) => r.file === 'src/auth.ts')!;
    const b = withoutSec.reviewItems.find((r) => r.file === 'src/auth.ts')!;
    expect(a.securityIssues).toBe(1);
    expect(a.risk).toBeGreaterThan(b.risk);
    expect(withSec.summary.securityIssues).toBe(1);
  });

  it('separates changed files not present in the graph', () => {
    const result = detectChanges({ graph: makeGraph(), changedFiles: ['src/auth.ts', 'README.md'], base: 'HEAD~1' });
    expect(result.unknownFiles).toContain('README.md');
    expect(result.reviewItems.map((r) => r.file)).not.toContain('README.md');
  });

  it('reports positive token savings and sorts by descending risk', () => {
    const result = detectChanges({ graph: makeGraph(), changedFiles: ['src/auth.ts', 'src/service.ts'], base: 'HEAD~1' });
    expect(result.contextSavings.savedTokens).toBeGreaterThan(0);
    expect(result.contextSavings.savedPercent).toBeGreaterThan(0);
    for (let i = 1; i < result.reviewItems.length; i++) {
      expect(result.reviewItems[i - 1].risk).toBeGreaterThanOrEqual(result.reviewItems[i].risk);
    }
  });
});
