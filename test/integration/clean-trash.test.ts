import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const cliPath = join(__dirname, '..', '..', 'dist', 'cli.js');

async function runCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [cliPath, ...args], { timeout: 30000, cwd });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code ?? 1 };
  }
}

describe('Integration: clean --apply moves dead files to trash', () => {
  let projectDir: string;

  beforeAll(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'vg-clean-'));
    await mkdir(join(projectDir, 'src'), { recursive: true });
    // Entry point that imports only utils
    await writeFile(join(projectDir, 'src/index.ts'), 'import { used } from "./utils.js";\nexport const main = used();', 'utf-8');
    await writeFile(join(projectDir, 'src/utils.ts'), 'export function used() { return 1; }', 'utf-8');
    // Orphan dead file — not reachable from index
    await writeFile(join(projectDir, 'src/orphan.ts'), 'export function dead() { return 2; }', 'utf-8');
    await writeFile(join(projectDir, 'package.json'), JSON.stringify({ name: 'p', main: 'src/index.ts' }), 'utf-8');
    await writeFile(join(projectDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' },
      include: ['src/**/*'],
    }), 'utf-8');

    await runCli(['init'], projectDir);
    await runCli(['map'], projectDir);
    await runCli(['clean', '--plan'], projectDir);
  });

  afterAll(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('detects the orphan file as dead code', async () => {
    const result = await runCli(['clean', '--plan', '--json'], projectDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const deadFiles = parsed.candidates.filter((c: { kind: string }) => c.kind === 'file').map((c: { path: string }) => c.path);
    expect(deadFiles).toContain('src/orphan.ts');
  });

  it('apply moves the dead file into .codescout-trash and removes the original', async () => {
    const result = await runCli(['clean', '--apply', '--json'], projectDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.applied).toBe(true);
    expect(parsed.movedFiles).toBeGreaterThanOrEqual(1);

    // Original orphan file should be gone
    let orphanExists = true;
    try {
      await access(join(projectDir, 'src/orphan.ts'));
    } catch {
      orphanExists = false;
    }
    expect(orphanExists).toBe(false);
  });

  it('trash list shows the moved file with recoverable content', async () => {
    const listResult = await runCli(['trash', 'list', '--json'], projectDir);
    expect(listResult.exitCode).toBe(0);
    const parsed = JSON.parse(listResult.stdout);
    expect(parsed.entries.length).toBeGreaterThanOrEqual(1);

    const entry = parsed.entries.find((e: { originalPath: string }) => e.originalPath === 'src/orphan.ts');
    expect(entry).toBeDefined();
  });

  it('trash restore brings the file back with identical content', async () => {
    const listResult = await runCli(['trash', 'list', '--json'], projectDir);
    const parsed = JSON.parse(listResult.stdout);
    const entry = parsed.entries.find((e: { originalPath: string }) => e.originalPath === 'src/orphan.ts');

    const restoreResult = await runCli(['trash', 'restore', entry.id], projectDir);
    expect(restoreResult.exitCode).toBe(0);

    const content = await readFile(join(projectDir, 'src/orphan.ts'), 'utf-8');
    expect(content).toContain('export function dead()');
  });
});
