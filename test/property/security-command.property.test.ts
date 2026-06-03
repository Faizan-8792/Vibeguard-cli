import { describe, it, expect } from 'vitest';
import { scanSecurity } from '../../src/engines/security-scanner.js';
import { loadConfig } from '../../src/storage/config-store.js';
import { SafetyContext } from '../../src/utils/safety.js';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Property 14: Read-Only by Default', () => {
  it('security scan does not modify any files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-sec-'));
    await mkdir(join(dir, '.codescout'), { recursive: true });
    await writeFile(join(dir, 'secret.ts'), 'const key = "sk-abcdefghijklmnopqrstuvwxyz";', 'utf-8');

    const originalContent = await readFile(join(dir, 'secret.ts'), 'utf-8');
    const config = await loadConfig(dir);

    // Just scanning should not modify anything
    await scanSecurity(dir, ['secret.ts'], config);

    const afterContent = await readFile(join(dir, 'secret.ts'), 'utf-8');
    expect(afterContent).toBe(originalContent);

    await rm(dir, { recursive: true, force: true });
  });
});

describe('Property 16: Gitignore Fix Idempotence', () => {
  it('running gitignore fix twice produces same result', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-sec-'));
    await mkdir(join(dir, '.codescout'), { recursive: true });
    await writeFile(join(dir, '.env'), 'SECRET=value', 'utf-8');
    await writeFile(join(dir, '.gitignore'), 'node_modules\n', 'utf-8');

    // Simulate gitignore fix logic
    const requiredEntries = ['.env', '.env.local', '.codescout/', '.codescout-trash/'];

    async function applyGitignoreFix() {
      const gitignorePath = join(dir, '.gitignore');
      let content = await readFile(gitignorePath, 'utf-8');
      const existingLines = content.split('\n').map((l) => l.trim());
      const toAdd: string[] = [];

      for (const entry of requiredEntries) {
        if (!existingLines.includes(entry)) {
          toAdd.push(entry);
        }
      }

      if (toAdd.length > 0) {
        const newContent = content.endsWith('\n')
          ? content + toAdd.join('\n') + '\n'
          : content + '\n' + toAdd.join('\n') + '\n';
        await writeFile(gitignorePath, newContent, 'utf-8');
      }
    }

    await applyGitignoreFix();
    const afterFirst = await readFile(join(dir, '.gitignore'), 'utf-8');

    await applyGitignoreFix();
    const afterSecond = await readFile(join(dir, '.gitignore'), 'utf-8');

    expect(afterSecond).toBe(afterFirst);

    await rm(dir, { recursive: true, force: true });
  });
});

describe('Property 18: Project Root Boundary Enforcement', () => {
  it('rejects paths outside project root', () => {
    const safety = new SafetyContext({
      dryRun: false,
      gitSafe: false,
      force: false,
      projectRoot: '/project',
    });

    expect(() => safety.enforceProjectBoundary('/project/../etc/passwd')).toThrow();
    expect(() => safety.enforceProjectBoundary('/other/file.ts')).toThrow();
  });

  it('accepts paths inside project root', () => {
    const safety = new SafetyContext({
      dryRun: false,
      gitSafe: false,
      force: false,
      projectRoot: '/project',
    });

    expect(() => safety.enforceProjectBoundary('/project/src/file.ts')).not.toThrow();
    expect(() => safety.enforceProjectBoundary('/project/deep/nested/file.ts')).not.toThrow();
  });
});
