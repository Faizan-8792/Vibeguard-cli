import { describe, it, expect } from 'vitest';
import { applyFixes, type FileFixPlan } from '../../src/engines/ai-fixer.js';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('AI Fixer — applyFixes', () => {
  it('writes fixed content and backs up the original', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-fix-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    const original = 'const key = "sk-secret123";\n';
    const fixed = 'const key = process.env.API_KEY;\n';
    await writeFile(join(dir, 'src/a.ts'), original, 'utf-8');

    const plans: FileFixPlan[] = [
      { file: 'src/a.ts', issues: ['hardcoded secret'], originalContent: original, fixedContent: fixed, changed: true, explanation: 'moved to env' },
    ];

    const { applied, backupDir } = await applyFixes(dir, plans);

    expect(applied).toBe(1);

    // Fixed content written
    const after = await readFile(join(dir, 'src/a.ts'), 'utf-8');
    expect(after).toBe(fixed);

    // Backup exists with original content
    const backup = await readFile(join(backupDir, 'src/a.ts'), 'utf-8');
    expect(backup).toBe(original);

    await rm(dir, { recursive: true, force: true });
  });

  it('skips plans marked changed=false', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-fix-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    const original = 'export const x = 1;\n';
    await writeFile(join(dir, 'src/b.ts'), original, 'utf-8');

    const plans: FileFixPlan[] = [
      { file: 'src/b.ts', issues: [], originalContent: original, fixedContent: original, changed: false, explanation: 'no change' },
    ];

    const { applied } = await applyFixes(dir, plans);
    expect(applied).toBe(0);

    // File unchanged
    const after = await readFile(join(dir, 'src/b.ts'), 'utf-8');
    expect(after).toBe(original);

    await rm(dir, { recursive: true, force: true });
  });

  it('original is recoverable from backup after fix', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-fix-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    const original = 'eval(userInput);\n';
    const fixed = 'JSON.parse(userInput);\n';
    await writeFile(join(dir, 'src/c.ts'), original, 'utf-8');

    const plans: FileFixPlan[] = [
      { file: 'src/c.ts', issues: ['eval'], originalContent: original, fixedContent: fixed, changed: true, explanation: 'replaced eval' },
    ];

    const { backupDir } = await applyFixes(dir, plans);

    // Backup dir is under .vibeguard-trash
    expect(backupDir).toContain('.vibeguard-trash');
    let backupExists = true;
    try {
      await access(join(backupDir, 'src/c.ts'));
    } catch {
      backupExists = false;
    }
    expect(backupExists).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });
});
