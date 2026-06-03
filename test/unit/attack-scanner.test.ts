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

  it('detects insecure deserialization (yaml.load)', async () => {
    const dir = await setup({
      'src/d.ts': 'import yaml from "js-yaml"; const cfg = yaml.load(userInput);',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/d.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'Insecure Deserialization')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it("detects JWT 'none' algorithm confusion", async () => {
    const dir = await setup({
      'src/jwt.ts': 'jwt.verify(token, key, { algorithms: ["none"] });',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/jwt.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'JWT Algorithm Confusion')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('detects jwt.decode without jwt.verify', async () => {
    const dir = await setup({
      'src/jwt2.ts': 'const claims = jwt.decode(req.headers.authorization);',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/jwt2.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'JWT Signature Not Verified')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('does not flag jwt.decode when jwt.verify is also present', async () => {
    const dir = await setup({
      'src/jwt3.ts': 'jwt.verify(t, k); const c = jwt.decode(t);',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/jwt3.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'JWT Signature Not Verified')).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });

  it('detects disabled TLS certificate validation', async () => {
    const dir = await setup({
      'src/tls.ts': 'const agent = new https.Agent({ rejectUnauthorized: false });',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/tls.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'Disabled TLS Certificate Validation')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('detects SSTI via template compiled from user input', async () => {
    const dir = await setup({
      'src/ssti.ts': 'const tpl = Handlebars.compile(req.body.template);',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/ssti.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'Server-Side Template Injection (SSTI)')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('detects sensitive data written to logs', async () => {
    const dir = await setup({
      'src/log.ts': 'console.log("user password is", password);',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/log.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'Sensitive Data Exposure (Logging)')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('detects timing-unsafe secret comparison', async () => {
    const dir = await setup({
      'src/cmp.ts': 'if (token === req.query.token) { grant(); }',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/cmp.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'Timing-Unsafe Secret Comparison')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('detects ReDoS via RegExp built from user input', async () => {
    const dir = await setup({
      'src/redos.ts': 'const re = new RegExp(req.query.pattern);',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/redos.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'Regular Expression DoS (ReDoS)')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('detects CORS origin reflection', async () => {
    const dir = await setup({
      'src/cors.ts': 'res.setHeader("Access-Control-Allow-Origin", req.headers.origin);',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/cors.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'CORS Origin Reflection')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('detects insecure postMessage wildcard target', async () => {
    const dir = await setup({
      'src/pm.ts': 'win.postMessage(data, "*");',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/pm.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'Insecure postMessage Target')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('detects a service bound to 0.0.0.0', async () => {
    const dir = await setup({
      'src/srv.ts': 'app.listen(3000, "0.0.0.0");',
    });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/srv.ts'], config);
    expect(result.findings.some((f) => f.attackType === 'Service Bound to All Interfaces')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('expanded coverage now lists at least 30 attack types', async () => {
    const dir = await setup({ 'src/clean.ts': 'export const x = 1;' });
    const config = await loadConfig(dir);
    const result = await scanAttacks(dir, ['src/clean.ts'], config);
    expect(result.coverage.length).toBeGreaterThanOrEqual(30);
    await rm(dir, { recursive: true, force: true });
  });
});
