import { describe, it, expect } from 'vitest';
import { scanAttacks } from '../../src/engines/attack-scanner.js';
import { loadConfig } from '../../src/storage/config-store.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vg-atk-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await mkdir(join(dir, '.vibeguard'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content, 'utf-8');
  }
  return dir;
}

describe('Attack Scanner', () => {
  it('detects SQL injection via string interpolation', async () => {
    const dir = await setup({
      'src/db.ts': 'function getUser(db, id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/db.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'SQL Injection')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('detects command injection', async () => {
    const dir = await setup({
      'src/cmd.ts': 'import { exec } from "child_process"; exec(`ping ${host}`);',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/cmd.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'Command Injection')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('detects eval-based code execution', async () => {
    const dir = await setup({
      'src/calc.ts': 'function calc(expr) { return eval(expr); }',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/calc.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'Arbitrary Code Execution')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('detects weak MD5 crypto', async () => {
    const dir = await setup({
      'src/hash.ts': 'import { createHash } from "crypto"; createHash("md5").update(x);',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/hash.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'Weak Cryptography')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('suppresses DDoS finding when rate limiting is present', async () => {
    const dir = await setup({
      'src/server.ts': 'import rateLimit from "express-rate-limit"; app.use(rateLimit()); app.get("/x", h);',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/server.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'DDoS / Resource Exhaustion')).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });

  it('reports coverage list and severity counts', async () => {
    const dir = await setup({
      'src/clean.ts': 'export const x = 1;',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/clean.ts'], config);
    expect(result.coverage.length).toBeGreaterThanOrEqual(15);
    expect(result.counts).toHaveProperty('critical');
    expect(result.counts).toHaveProperty('high');
    await rm(dir, { recursive: true, force: true });
  });

  it('generates stable finding IDs', async () => {
    const dir = await setup({
      'src/db.ts': 'db.query(`SELECT * FROM t WHERE id = ${id}`);',
    });
    const config = await loadConfig(dir);
    const r1 = await scanAttacks(dir, ['src/db.ts'], config);
    const r2 = await scanAttacks(dir, ['src/db.ts'], config);
    expect(r1.findings[0]?.id).toBe(r2.findings[0]?.id);
    await rm(dir, { recursive: true, force: true });
  });
});
