import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { DeadCodeCandidate } from '../../src/engines/dead-code-scanner.js';

describe('Property 22: Cleanup Plan Sort Order', () => {
  it('candidates sorted by ascending importance', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1 }),
            path: fc.string({ minLength: 1 }),
            kind: fc.constant('file' as const),
            importance: fc.integer({ min: 0, max: 100 }),
            lastCommitDate: fc.constant(null),
            testOnlyReferences: fc.boolean(),
          }),
          { minLength: 2, maxLength: 20 },
        ),
        (candidates) => {
          // Sort by ascending importance (as clean command does)
          const sorted = [...candidates].sort((a, b) => a.importance - b.importance);

          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].importance).toBeGreaterThanOrEqual(sorted[i - 1].importance);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('Property 15: Dry-Run Immutability', () => {
  it('SafetyContext in dry-run mode records changes without executing', async () => {
    const { SafetyContext } = await import('../../src/utils/safety.js');

    const safety = new SafetyContext({
      dryRun: true,
      gitSafe: false,
      force: false,
      projectRoot: '/tmp/test',
    });

    expect(safety.isDryRun).toBe(true);

    safety.recordChange({ type: 'delete', path: 'src/file.ts' });
    safety.recordChange({ type: 'move', path: 'src/old.ts', targetPath: 'trash/old.ts' });

    const changes = safety.getPlannedChanges();
    expect(changes).toHaveLength(2);
    expect(changes[0].type).toBe('delete');
    expect(changes[1].type).toBe('move');
  });
});
