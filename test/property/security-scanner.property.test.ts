import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { scanSecurity } from '../../src/engines/security-scanner.js';
import { loadConfig } from '../../src/storage/config-store.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Property 11: Secret Pattern Detection', () => {
  it('detects OpenAI keys in any file content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Za-z0-9]{20,40}$/),
        async (suffix) => {
          const key = `sk-${suffix}`;
          const dir = await mkdtemp(join(tmpdir(), 'vg-sec-'));
          await mkdir(join(dir, '.vibeguard'), { recursive: true });
          await writeFile(join(dir, 'config.ts'), `const apiKey = "${key}";`, 'utf-8');

          const config = await loadConfig(dir);
          const result = await scanSecurity(dir, ['config.ts'], config);

          const secretIssues = result.issues.filter((i) => i.category === 'hard-coded-secret');
          expect(secretIssues.length).toBeGreaterThan(0);

          await rm(dir, { recursive: true, force: true });
        },
      ),
      { numRuns: 10 },
    );
  });

  it('detects AWS access key IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[0-9A-Z]{16}$/),
        async (suffix) => {
          const key = `AKIA${suffix}`;
          const dir = await mkdtemp(join(tmpdir(), 'vg-sec-'));
          await mkdir(join(dir, '.vibeguard'), { recursive: true });
          await writeFile(join(dir, 'aws.ts'), `const key = "${key}";`, 'utf-8');

          const config = await loadConfig(dir);
          const result = await scanSecurity(dir, ['aws.ts'], config);

          const awsIssues = result.issues.filter((i) => i.message.includes('AWS'));
          expect(awsIssues.length).toBeGreaterThan(0);

          await rm(dir, { recursive: true, force: true });
        },
      ),
      { numRuns: 10 },
    );
  });
});

describe('Property 12: Security Issue ID Stability', () => {
  it('same content produces same issue ID across runs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-sec-'));
    await mkdir(join(dir, '.vibeguard'), { recursive: true });
    await writeFile(join(dir, 'secret.ts'), 'const key = "sk-abcdefghijklmnopqrstuvwxyz";', 'utf-8');

    const config = await loadConfig(dir);
    const result1 = await scanSecurity(dir, ['secret.ts'], config);
    const result2 = await scanSecurity(dir, ['secret.ts'], config);

    expect(result1.issues.length).toBe(result2.issues.length);
    for (let i = 0; i < result1.issues.length; i++) {
      expect(result1.issues[i].id).toBe(result2.issues[i].id);
    }

    await rm(dir, { recursive: true, force: true });
  });
});

describe('Property 13: Framework Misuse Detection', () => {
  it('detects cors wildcard origin', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-sec-'));
    await mkdir(join(dir, '.vibeguard'), { recursive: true });
    await writeFile(join(dir, 'server.ts'), `app.use(cors({ origin: '*' }));`, 'utf-8');

    const config = await loadConfig(dir);
    const result = await scanSecurity(dir, ['server.ts'], config);

    const frameworkIssues = result.issues.filter((i) => i.category === 'framework-misuse');
    expect(frameworkIssues.length).toBeGreaterThan(0);
    expect(frameworkIssues[0].message).toContain('CORS');

    await rm(dir, { recursive: true, force: true });
  });

  it('detects cors without config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-sec-'));
    await mkdir(join(dir, '.vibeguard'), { recursive: true });
    await writeFile(join(dir, 'server.ts'), `app.use(cors());`, 'utf-8');

    const config = await loadConfig(dir);
    const result = await scanSecurity(dir, ['server.ts'], config);

    const frameworkIssues = result.issues.filter((i) => i.category === 'framework-misuse');
    expect(frameworkIssues.length).toBeGreaterThan(0);

    await rm(dir, { recursive: true, force: true });
  });
});
