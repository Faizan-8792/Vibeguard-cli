import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanMisconfig, classifyFile } from '../../src/engines/misconfig-scanner.js';

async function setup(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vg-mis-'));
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf-8');
  }
  return dir;
}

describe('Misconfig Scanner — file classification', () => {
  it('classifies hardening config files', () => {
    expect(classifyFile('etc/ssh/sshd_config')).toBe('sshd');
    expect(classifyFile('nginx.conf')).toBe('nginx');
    expect(classifyFile('sites-available/site.conf')).toBe('nginx');
    expect(classifyFile('my.cnf')).toBe('mysql');
    expect(classifyFile('Dockerfile')).toBe('dockerfile');
    expect(classifyFile('src/index.ts')).toBe('other');
  });
});

describe('Misconfig Scanner — SSH hardening (dev-sec inspired)', () => {
  it('flags PermitRootLogin yes', async () => {
    const dir = await setup({ 'sshd_config': 'PermitRootLogin yes\n' });
    const r = await scanMisconfig(dir, ['sshd_config']);
    expect(r.findings.some((f) => f.id.includes('SSH-001'))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('flags PasswordAuthentication yes and empty passwords', async () => {
    const dir = await setup({ 'sshd_config': 'PasswordAuthentication yes\nPermitEmptyPasswords yes\n' });
    const r = await scanMisconfig(dir, ['sshd_config']);
    expect(r.findings.some((f) => f.id.includes('SSH-002'))).toBe(true);
    expect(r.findings.some((f) => f.id.includes('SSH-003'))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('does not flag a hardened sshd_config', async () => {
    const dir = await setup({ 'sshd_config': 'PermitRootLogin no\nPasswordAuthentication no\n' });
    const r = await scanMisconfig(dir, ['sshd_config']);
    expect(r.findings.some((f) => f.id.includes('SSH-'))).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('Misconfig Scanner — nginx & MySQL hardening', () => {
  it('flags nginx server_tokens on and weak TLS', async () => {
    const dir = await setup({ 'nginx.conf': 'server_tokens on;\nssl_protocols TLSv1 TLSv1.2;\n' });
    const r = await scanMisconfig(dir, ['nginx.conf']);
    expect(r.findings.some((f) => f.id.includes('NGINX-001'))).toBe(true);
    expect(r.findings.some((f) => f.id.includes('NGINX-002'))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('flags MySQL skip-grant-tables and local-infile', async () => {
    const dir = await setup({ 'my.cnf': '[mysqld]\nskip-grant-tables\nlocal-infile=1\n' });
    const r = await scanMisconfig(dir, ['my.cnf']);
    expect(r.findings.some((f) => f.id.includes('MYSQL-001'))).toBe(true);
    expect(r.findings.some((f) => f.id.includes('MYSQL-002'))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('produces stable IDs and severity counts', async () => {
    const dir = await setup({ 'sshd_config': 'PermitRootLogin yes\n' });
    const r1 = await scanMisconfig(dir, ['sshd_config']);
    const r2 = await scanMisconfig(dir, ['sshd_config']);
    expect(r1.findings[0]?.id).toBe(r2.findings[0]?.id);
    expect(r1.counts).toHaveProperty('critical');
    await rm(dir, { recursive: true, force: true });
  });
});
