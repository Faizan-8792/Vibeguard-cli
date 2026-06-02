import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { estimateCost } from '../../src/engines/cost-estimator.js';
import { loadConfig } from '../../src/storage/config-store.js';

describe('Cost Estimator', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `vibeguard-cost-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(testDir, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('estimates tokens for TypeScript files', async () => {
    const content = Array(10).fill('export const x = 1;').join('\n');
    await writeFile(join(testDir, 'src', 'file.ts'), content, 'utf-8');

    const config = await loadConfig(testDir);
    const estimate = await estimateCost(['src/file.ts'], testDir, config);

    expect(estimate.tokens).toBeGreaterThan(0);
    expect(estimate.range.low).toBe(Math.round(estimate.tokens * 0.8));
    expect(estimate.range.high).toBe(Math.round(estimate.tokens * 1.2));
  });

  it('provides per-model estimates', async () => {
    await writeFile(join(testDir, 'src', 'file.ts'), 'export const x = 1;\n'.repeat(5), 'utf-8');

    const config = await loadConfig(testDir);
    const estimate = await estimateCost(['src/file.ts'], testDir, config);

    expect(estimate.perModel['claude-3']).toBeDefined();
    expect(estimate.perModel['gpt-4']).toBeDefined();
    expect(estimate.perModel['claude-3'].tokens).toBeGreaterThan(0);
    expect(estimate.perModel['claude-3'].usd).toBeGreaterThan(0);
  });

  it('returns zero for empty file list', async () => {
    const config = await loadConfig(testDir);
    const estimate = await estimateCost([], testDir, config);

    expect(estimate.tokens).toBe(0);
    expect(estimate.range.low).toBe(0);
    expect(estimate.range.high).toBe(0);
  });

  it('handles missing files gracefully', async () => {
    const config = await loadConfig(testDir);
    const estimate = await estimateCost(['nonexistent.ts'], testDir, config);

    expect(estimate.tokens).toBe(0);
  });
});
