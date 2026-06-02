import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { estimateCost } from '../../src/engines/cost-estimator.js';
import { loadConfig } from '../../src/storage/config-store.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Property 32: Cost Estimation Formula', () => {
  it('tokens are non-negative and range brackets are 0.8x to 1.2x', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: fc.stringMatching(/^[a-z]{2,6}\.ts$/),
            lines: fc.integer({ min: 1, max: 100 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (fileSpecs) => {
          const dir = await mkdtemp(join(tmpdir(), 'vg-cost-'));
          await mkdir(join(dir, '.vibeguard'), { recursive: true });

          const files: string[] = [];
          for (const spec of fileSpecs) {
            const content = Array.from({ length: spec.lines }, (_, i) => `const x${i} = ${i};`).join('\n');
            await writeFile(join(dir, spec.name), content, 'utf-8');
            files.push(spec.name);
          }

          const config = await loadConfig(dir);
          const result = await estimateCost(files, dir, config);

          // Tokens should be non-negative
          expect(result.tokens).toBeGreaterThanOrEqual(0);

          // Range should be 0.8x to 1.2x
          expect(result.range.low).toBe(Math.round(result.tokens * 0.8));
          expect(result.range.high).toBe(Math.round(result.tokens * 1.2));

          // Per-model estimates should exist for configured models
          for (const [modelName, modelEstimate] of Object.entries(result.perModel)) {
            expect(modelEstimate.tokens).toBeGreaterThanOrEqual(0);
            expect(modelEstimate.usd).toBeGreaterThanOrEqual(0);
          }

          await rm(dir, { recursive: true, force: true });
        },
      ),
      { numRuns: 10 },
    );
  });

  it('more lines produce more tokens for same extension', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-cost-'));
    await mkdir(join(dir, '.vibeguard'), { recursive: true });

    // Small file
    await writeFile(join(dir, 'small.ts'), 'const x = 1;\n', 'utf-8');
    // Large file
    await writeFile(join(dir, 'large.ts'), Array.from({ length: 100 }, (_, i) => `const x${i} = ${i};`).join('\n'), 'utf-8');

    const config = await loadConfig(dir);
    const smallResult = await estimateCost(['small.ts'], dir, config);
    const largeResult = await estimateCost(['large.ts'], dir, config);

    expect(largeResult.tokens).toBeGreaterThan(smallResult.tokens);

    await rm(dir, { recursive: true, force: true });
  });

  it('empty file list produces zero tokens', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-cost-'));
    await mkdir(join(dir, '.vibeguard'), { recursive: true });

    const config = await loadConfig(dir);
    const result = await estimateCost([], dir, config);

    expect(result.tokens).toBe(0);
    expect(result.range.low).toBe(0);
    expect(result.range.high).toBe(0);

    await rm(dir, { recursive: true, force: true });
  });
});
