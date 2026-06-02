import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../../src/utils/logger.js';
import { loadConfig } from '../../src/storage/config-store.js';
import { runAudit } from '../../src/commands/audit.js';
import { createTools } from '../../src/mcp/tools.js';
import type { CommandContext } from '../../src/context.js';

let projectRoot: string;

async function makeCtx(root: string, json: boolean): Promise<CommandContext> {
  const config = await loadConfig(root);
  const logger = createLogger({ jsonMode: json, quiet: true, verbose: false, command: 'audit' });
  return {
    options: { json, cwd: root, include: [], exclude: [], config: undefined, verbose: false, quiet: true },
    config,
    logger,
    projectRoot: root,
  };
}

async function capture(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const orig = process.stdout.write;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout.write as any) = (c: any) => { lines.push(String(c)); return true; };
  try { await fn(); } finally { process.stdout.write = orig; }
  return lines.join('');
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'vg-audit-'));
  await mkdir(join(projectRoot, '.vibeguard'), { recursive: true });
  await mkdir(join(projectRoot, 'src'), { recursive: true });
  // A vulnerable dependency + a taint flow + a misconfig, so the audit has signal.
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({
    name: 'fixture', version: '1.0.0', dependencies: { lodash: '4.17.20' },
  }), 'utf-8');
  await writeFile(join(projectRoot, 'src', 'handler.ts'), 'const c = req.body.cmd;\nexec(c);\n', 'utf-8');
  await writeFile(join(projectRoot, 'Dockerfile'), 'FROM node:latest\nUSER root\n', 'utf-8');
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('Integration: audit command', () => {
  it('emits a unified JSON report with a security score and all engine sections', async () => {
    const ctx = await makeCtx(projectRoot, true);
    const out = await capture(() => runAudit(ctx, { sbom: false }));
    const json = JSON.parse(out);

    expect(json.schemaVersion).toBeDefined();
    expect(typeof json.riskScore).toBe('number');
    expect(json.dependencies).toBeDefined();
    expect(json.taint).toBeDefined();
    expect(json.misconfig).toBeDefined();
    expect(json.secrets).toBeDefined();
    expect(json.attacks).toBeDefined();

    // The seeded vulnerable lodash should appear.
    expect(json.dependencies.findings.some((f: { package: string }) => f.package === 'lodash')).toBe(true);
    // The seeded taint flow should appear.
    expect(json.taint.findings.some((f: { rule: string }) => f.rule === 'command-injection')).toBe(true);
    // The seeded Dockerfile misconfig should appear.
    expect(json.misconfig.findings.length).toBeGreaterThan(0);
    // Score penalized below 100.
    expect(json.riskScore).toBeLessThan(100);
  });

  it('writes a CycloneDX SBOM when --sbom is set', async () => {
    const ctx = await makeCtx(projectRoot, true);
    const out = await capture(() => runAudit(ctx, { sbom: true }));
    const json = JSON.parse(out);
    expect(json.sbom).toBe('.vibeguard/sbom.json');
    expect(await exists(join(projectRoot, '.vibeguard', 'sbom.json'))).toBe(true);

    const sbom = JSON.parse(await readFile(join(projectRoot, '.vibeguard', 'sbom.json'), 'utf-8'));
    expect(sbom.bomFormat).toBe('CycloneDX');
    expect(sbom.components.some((c: { name: string }) => c.name === 'lodash')).toBe(true);
  });

  it('renders a terminal report with a Security Score header', async () => {
    const ctx = await makeCtx(projectRoot, false);
    const out = await capture(() => runAudit(ctx, { sbom: false }));
    expect(out).toContain('Unified Security Audit');
    expect(out).toContain('Security Score');
  });
});

describe('Integration: MCP run_audit tool', () => {
  it('returns a security score and per-engine finding counts', async () => {
    const tool = createTools().find((t) => t.name === 'run_audit');
    expect(tool).toBeDefined();
    const result = await tool!.run({}, { projectRoot }) as {
      securityScore: number;
      taintFindings: number;
      misconfigFindings: number;
      dependencies: { vulnerabilities: number };
    };
    expect(typeof result.securityScore).toBe('number');
    expect(result.taintFindings).toBeGreaterThan(0);
    expect(result.misconfigFindings).toBeGreaterThan(0);
    expect(result.dependencies.vulnerabilities).toBeGreaterThan(0);
  });
});
