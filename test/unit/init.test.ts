import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInit } from '../../src/commands/init.js';
import { createLogger } from '../../src/utils/logger.js';
import type { CommandContext } from '../../src/cli.js';

function makeCtx(projectRoot: string): CommandContext {
  const logger = createLogger({ jsonMode: true, quiet: true, verbose: false, command: 'init' });
  return {
    options: { json: true, cwd: projectRoot, include: [], exclude: [], config: undefined, verbose: false, quiet: true },
    config: { ignore: [], tags: { customRules: [] }, importance: { weights: { dependents: 5, imports: 2, git: 3, route: 4 } }, security: { customSecretPatterns: [] }, context: { defaultRadius: 2, defaultTokenBudget: 12000, models: {} }, clean: { maxChangesPerRun: 50 }, limits: { maxFilesPerRun: 200 }, effectiveSkipSet: [], effectiveInclude: [] },
    logger,
    projectRoot,
  };
}

describe('Init Command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `vibeguard-init-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates .vibeguard/config.json with defaults', async () => {
    const ctx = makeCtx(testDir);
    await runInit(ctx, { force: false });

    const configPath = join(testDir, '.vibeguard', 'config.json');
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content);

    expect(config.ignore).toContain('node_modules/**');
    expect(config.importance.weights.dependents).toBe(5);
    expect(config.context.defaultRadius).toBe(2);
    expect(config.context.defaultTokenBudget).toBe(12000);
  });

  it('refuses to overwrite without --force', async () => {
    const ctx = makeCtx(testDir);
    await runInit(ctx, { force: false });

    await expect(runInit(ctx, { force: false })).rejects.toThrow('already exists');
  });

  it('overwrites with --force', async () => {
    const ctx = makeCtx(testDir);
    await runInit(ctx, { force: false });
    await runInit(ctx, { force: true }); // Should not throw

    const configPath = join(testDir, '.vibeguard', 'config.json');
    await access(configPath); // Should exist
  });

  it('creates .vibeguard/ directory', async () => {
    const ctx = makeCtx(testDir);
    await runInit(ctx, { force: false });

    const dirPath = join(testDir, '.vibeguard');
    await access(dirPath); // Should exist
  });
});
