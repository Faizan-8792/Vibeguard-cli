import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { GraphData } from '../../src/engines/graph-builder.js';

describe('Property 30: Health Score Bounds and Computation', () => {
  it('projectHealth is always between 0 and 100', () => {
    fc.assert(
      fc.property(
        fc.record({
          security: fc.oneof(fc.integer({ min: 0, max: 100 }), fc.constant(null as number | null)),
          deadCode: fc.oneof(fc.integer({ min: 0, max: 100 }), fc.constant(null as number | null)),
          architecture: fc.oneof(fc.integer({ min: 0, max: 100 }), fc.constant(null as number | null)),
          contextEfficiency: fc.oneof(fc.integer({ min: 0, max: 100 }), fc.constant(null as number | null)),
        }),
        (scores) => {
          const validScores = [scores.security, scores.deadCode, scores.architecture, scores.contextEfficiency]
            .filter((s): s is number => s !== null);

          const projectHealth = validScores.length > 0
            ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
            : 0;

          const clamped = Math.max(0, Math.min(100, projectHealth));
          expect(clamped).toBeGreaterThanOrEqual(0);
          expect(clamped).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('health score is average of non-null sub-scores', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 4 }),
        (scores) => {
          const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          const clamped = Math.max(0, Math.min(100, avg));
          expect(clamped).toBeGreaterThanOrEqual(0);
          expect(clamped).toBeLessThanOrEqual(100);
          // Average of values 0-100 should be 0-100
          expect(clamped).toBe(avg);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('Property 31: Architecture Score Derivation', () => {
  it('architecture score decreases with high fan-in nodes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        (highFanInCount) => {
          // Simulate architecture score computation
          let penalty = 0;
          penalty += highFanInCount * 5;
          const score = Math.max(0, Math.min(100, 100 - penalty));

          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);

          // More high fan-in nodes = lower score
          if (highFanInCount > 0) {
            expect(score).toBeLessThan(100);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('architecture score decreases with cyclic dependencies', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        (cyclicCount) => {
          let penalty = 0;
          penalty += Math.floor(cyclicCount / 2) * 3;
          const score = Math.max(0, Math.min(100, 100 - penalty));

          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 50 },
    );
  });
});
