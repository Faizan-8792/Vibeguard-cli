import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  auditDependencies,
  isVersionVulnerable,
  parseSemver,
  compareSemver,
  buildSbom,
} from '../../src/engines/dependency-auditor.js';
import { analyzeFileContent, analyzeTaint } from '../../src/engines/taint-analyzer.js';
import { scanMisconfig, classifyFile } from '../../src/engines/misconfig-scanner.js';
import { computeRiskScore } from '../../src/commands/audit.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vg-sec-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// ─── Dependency auditor (SCA) ──────────────────────────────────────────────

describe('dependency-auditor: semver core', () => {
  it('parses semver and strips range prefixes', () => {
    expect(parseSemver('^1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('~4.17.20')).toEqual({ major: 4, minor: 17, patch: 20 });
    expect(parseSemver('v2.6.0')).toEqual({ major: 2, minor: 6, patch: 0 });
    expect(parseSemver('not-a-version')).toBeNull();
  });

  it('compares semvers correctly', () => {
    expect(compareSemver({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBeLessThan(0);
    expect(compareSemver({ major: 4, minor: 17, patch: 21 }, { major: 4, minor: 17, patch: 20 })).toBeGreaterThan(0);
    expect(compareSemver({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 3 })).toBe(0);
  });

  it('flags versions below the advisory fixedIn and clears at/above it', () => {
    const adv = { package: 'lodash', fixedIn: '4.17.21', introducedIn: '0.0.0', severity: 'high' as const, advisory: 'X', title: 't', recommendation: 'r' };
    expect(isVersionVulnerable('4.17.20', adv)).toBe(true);
    expect(isVersionVulnerable('4.17.21', adv)).toBe(false);
    expect(isVersionVulnerable('5.0.0', adv)).toBe(false);
  });
});

describe('dependency-auditor: audit', () => {
  async function writePkg(deps: Record<string, string>, dev: Record<string, string> = {}): Promise<void> {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: deps, devDependencies: dev }), 'utf-8');
  }

  it('returns an empty result when no package.json exists', async () => {
    const res = await auditDependencies(dir);
    expect(res.summary.totalDependencies).toBe(0);
    expect(res.findings).toEqual([]);
  });

  it('flags a known-vulnerable dependency from the bundled DB', async () => {
    await writePkg({ lodash: '4.17.20' });
    const res = await auditDependencies(dir);
    const vuln = res.findings.find((f) => f.package === 'lodash' && f.category === 'known-vulnerability');
    expect(vuln).toBeDefined();
    expect(vuln!.severity).toBe('high');
    expect(vuln!.fixedIn).toBe('4.17.21');
  });

  it('does NOT flag a patched version', async () => {
    await writePkg({ lodash: '4.17.21' });
    const res = await auditDependencies(dir);
    expect(res.findings.some((f) => f.package === 'lodash' && f.category === 'known-vulnerability')).toBe(false);
  });

  it('flags deprecated packages', async () => {
    await writePkg({ request: '2.88.0' });
    const res = await auditDependencies(dir);
    expect(res.findings.some((f) => f.category === 'deprecated' && f.package === 'request')).toBe(true);
  });

  it('prefers the lockfile-resolved version over the declared range', async () => {
    await writePkg({ axios: '^1.5.0' });
    await writeFile(
      join(dir, 'package-lock.json'),
      JSON.stringify({ packages: { 'node_modules/axios': { version: '1.5.0' } } }),
      'utf-8',
    );
    const res = await auditDependencies(dir);
    const axios = res.components.find((c) => c.name === 'axios');
    expect(axios!.version).toBe('1.5.0');
    // 1.5.0 < 1.6.0 fixedIn → vulnerable
    expect(res.findings.some((f) => f.package === 'axios' && f.category === 'known-vulnerability')).toBe(true);
  });

  it('builds a CycloneDX-shaped SBOM with sorted components and purls', async () => {
    await writePkg({ axios: '1.6.0', lodash: '4.17.21' });
    const res = await auditDependencies(dir);
    const sbom = buildSbom(res) as { bomFormat: string; components: Array<{ name: string; purl: string }> };
    expect(sbom.bomFormat).toBe('CycloneDX');
    expect(sbom.components.map((c) => c.name)).toEqual(['axios', 'lodash']); // sorted
    expect(sbom.components[0].purl).toBe('pkg:npm/axios@1.6.0');
  });
});

// ─── Taint analyzer ────────────────────────────────────────────────────────

describe('taint-analyzer: source → sink', () => {
  it('flags req.body flowing into exec across lines', () => {
    const code = [
      'const cmd = req.body.cmd;',
      'exec(cmd);',
    ].join('\n');
    const findings = analyzeFileContent('app.ts', code);
    expect(findings.length).toBe(1);
    expect(findings[0].rule).toBe('command-injection');
    expect(findings[0].sourceLine).toBe(1);
    expect(findings[0].line).toBe(2);
  });

  it('flags a direct source expression in a SQL sink', () => {
    const code = 'db.query("SELECT * FROM u WHERE id=" + req.query.id);';
    const findings = analyzeFileContent('db.ts', code);
    expect(findings.some((f) => f.rule === 'sql-injection')).toBe(true);
  });

  it('suppresses when the tainted value is sanitized', () => {
    const code = [
      'const raw = req.query.id;',
      'const id = parseInt(raw);',
      'db.query(id);',
    ].join('\n');
    const findings = analyzeFileContent('db.ts', code);
    // id is sanitized via parseInt → no sql-injection on the query line
    expect(findings.some((f) => f.rule === 'sql-injection')).toBe(false);
  });

  it('does not flag clean code with no sources', () => {
    const code = 'const x = 2 + 2;\nexec("ls");';
    const findings = analyzeFileContent('clean.ts', code);
    expect(findings).toEqual([]);
  });

  it('var-flow findings carry higher confidence than direct-source ones', () => {
    const varFlow = analyzeFileContent('a.ts', 'const c = req.body.c;\nexec(c);')[0];
    const direct = analyzeFileContent('b.ts', 'exec(req.body.c);')[0];
    expect(varFlow.confidence).toBeGreaterThan(direct.confidence);
  });

  it('analyzeTaint scans real files and skips tests', async () => {
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'h.ts'), 'const u = req.body.u;\neval(u);', 'utf-8');
    await writeFile(join(dir, 'src', 'h.test.ts'), 'const u = req.body.u;\neval(u);', 'utf-8');
    const res = await analyzeTaint(dir, ['src/h.ts', 'src/h.test.ts']);
    expect(res.findings.length).toBe(1);
    expect(res.findings[0].file).toBe('src/h.ts');
  });
});

// ─── Misconfig scanner ─────────────────────────────────────────────────────

describe('misconfig-scanner', () => {
  it('classifies files by kind', () => {
    expect(classifyFile('Dockerfile')).toBe('dockerfile');
    expect(classifyFile('.env.production')).toBe('env');
    expect(classifyFile('tsconfig.json')).toBe('tsconfig');
    expect(classifyFile('.github/workflows/ci.yml')).toBe('ci');
    expect(classifyFile('src/index.ts')).toBe('other');
  });

  it('flags Dockerfile running as root and using :latest', async () => {
    await writeFile(join(dir, 'Dockerfile'), 'FROM node:latest\nUSER root\nCMD ["node","x.js"]', 'utf-8');
    const res = await scanMisconfig(dir, ['Dockerfile']);
    const codes = res.findings.map((f) => f.id.split('-').slice(0, 2).join('-'));
    expect(codes).toContain('MIS-DOCKER');
    expect(res.findings.some((f) => f.message.includes('root'))).toBe(true);
    expect(res.findings.some((f) => f.message.includes(':latest'))).toBe(true);
  });

  it('flags debug mode in .env', async () => {
    await writeFile(join(dir, '.env'), 'DEBUG=true\nAPI_URL=http://example.com', 'utf-8');
    const res = await scanMisconfig(dir, ['.env']);
    expect(res.findings.some((f) => f.message.toLowerCase().includes('debug'))).toBe(true);
    expect(res.findings.some((f) => f.message.includes('http://'))).toBe(true);
  });

  it('returns no findings for a clean tsconfig', async () => {
    await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }), 'utf-8');
    const res = await scanMisconfig(dir, ['tsconfig.json']);
    expect(res.findings.length).toBe(0);
  });
});

// ─── Risk score ────────────────────────────────────────────────────────────

describe('audit risk score', () => {
  it('is 100 with no findings and decreases with severity', () => {
    expect(computeRiskScore({ critical: 0, high: 0, medium: 0, low: 0, info: 0 })).toBe(100);
    expect(computeRiskScore({ critical: 1, high: 0, medium: 0, low: 0, info: 0 })).toBe(75);
    expect(computeRiskScore({ critical: 0, high: 1, medium: 0, low: 0, info: 0 })).toBe(88);
  });

  it('never goes below 0', () => {
    expect(computeRiskScore({ critical: 10, high: 10, medium: 10, low: 10, info: 0 })).toBe(0);
  });
});
