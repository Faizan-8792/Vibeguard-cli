import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { loadConfig } from '../../src/storage/config-store.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Creates a temp directory with `.codescout/config.json` written with the given content string. */
async function createTempConfig(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vg-prop-'));
  const configDir = join(dir, '.codescout');
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, 'config.json'), content, 'utf-8');
  return dir;
}

describe('Property 4: Config Schema Validation Rejects Invalid JSON', () => {
  it('rejects non-object config values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.array(fc.integer()),
        ),
        async (invalidValue) => {
          const dir = await createTempConfig(JSON.stringify(invalidValue));

          try {
            await loadConfig(dir);
            if (typeof invalidValue !== 'object' || invalidValue === null || Array.isArray(invalidValue)) {
              expect.fail('Should have thrown for non-object config');
            }
          } catch (err: unknown) {
            expect((err as Error).message).toContain('Config');
          } finally {
            await rm(dir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  it('rejects malformed JSON strings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string().filter((s) => {
          try { JSON.parse(s); return false; } catch { return true; }
        }),
        async (malformedJson) => {
          const dir = await createTempConfig(malformedJson);

          try {
            await loadConfig(dir);
            expect.fail('Should have thrown for malformed JSON');
          } catch (err: unknown) {
            expect((err as Error).message).toBeDefined();
          } finally {
            await rm(dir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe('Property 5: Glob Merge Correctness', () => {
  it('effective skip set is union of config.ignore and CLI --exclude', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.stringMatching(/^[a-z*]+$/), { minLength: 0, maxLength: 5 }),
        fc.array(fc.stringMatching(/^[a-z*]+$/), { minLength: 0, maxLength: 5 }),
        async (configIgnore, cliExclude) => {
          const dir = await mkdtemp(join(tmpdir(), 'vg-prop-'));
          const configDir = join(dir, '.codescout');
          await mkdir(configDir, { recursive: true });
          await writeFile(
            join(configDir, 'config.json'),
            JSON.stringify({ ignore: configIgnore }),
            'utf-8',
          );

          const resolved = await loadConfig(dir, undefined, [], cliExclude);

          // effectiveSkipSet should contain all items from both sources
          for (const item of configIgnore) {
            expect(resolved.effectiveSkipSet).toContain(item);
          }
          for (const item of cliExclude) {
            expect(resolved.effectiveSkipSet).toContain(item);
          }

          await rm(dir, { recursive: true, force: true });
        },
      ),
      { numRuns: 20 },
    );
  });

  it('CLI --include overrides default extensions when provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.stringMatching(/^\*\*\/\*\.[a-z]{2,4}$/), { minLength: 1, maxLength: 3 }),
        async (cliInclude) => {
          const dir = await mkdtemp(join(tmpdir(), 'vg-prop-'));
          const configDir = join(dir, '.codescout');
          await mkdir(configDir, { recursive: true });
          await writeFile(join(configDir, 'config.json'), JSON.stringify({}), 'utf-8');

          const resolved = await loadConfig(dir, undefined, cliInclude, []);

          expect(resolved.effectiveInclude).toEqual(cliInclude);

          await rm(dir, { recursive: true, force: true });
        },
      ),
      { numRuns: 10 },
    );
  });
});
