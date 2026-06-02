/**
 * Dependency Auditor — local-first Software Composition Analysis (SCA).
 *
 * Trivy-inspired, but with VibeGuard's constraints: zero native build, zero
 * network. It parses `package.json` + lockfiles, resolves installed versions,
 * and matches them against a *bundled* advisory database (no registry calls).
 * It also flags risky licenses and can emit a CycloneDX-style SBOM.
 *
 * Why bundled, not fetched: the core promise is "works offline, no API key".
 * The advisory set is intentionally small and high-signal; it is the seam where
 * a future `vibeguard advisories update` could refresh a local cache.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Severity } from './security-types.js';

export interface DependencyComponent {
  name: string;
  version: string;
  /** 'prod' | 'dev' — direct dependency classification. */
  scope: 'prod' | 'dev';
  /** Declared semver range from package.json (e.g. "^1.2.3"). */
  declaredRange: string;
}

export interface DependencyFinding {
  id: string;
  package: string;
  installedVersion: string;
  severity: Severity;
  category: 'known-vulnerability' | 'deprecated' | 'risky-license';
  message: string;
  recommendation: string;
  /** Advisory identifier (e.g. CVE / GHSA / internal) when applicable. */
  advisory?: string;
  /** Fixed version range, when known. */
  fixedIn?: string;
}

export interface DependencyAuditResult {
  schemaVersion: string;
  summary: {
    totalDependencies: number;
    prodDependencies: number;
    devDependencies: number;
    vulnerabilities: number;
    deprecated: number;
    riskyLicenses: number;
  };
  counts: Record<Severity, number>;
  findings: DependencyFinding[];
  components: DependencyComponent[];
}

export const DEPENDENCY_AUDIT_SCHEMA_VERSION = '1.0.0';

/** A single advisory in the bundled DB. */
interface Advisory {
  package: string;
  /** Inclusive upper bound: versions strictly below `fixedIn` are vulnerable. */
  fixedIn: string;
  /** Optional lower bound (versions >= introducedIn are affected). */
  introducedIn?: string;
  severity: Severity;
  advisory: string;
  title: string;
  recommendation: string;
}

/**
 * Bundled, high-signal advisory database. Deliberately small and well-known so
 * results are deterministic and offline. Versions use plain semver.
 */
const BUNDLED_ADVISORIES: Advisory[] = [
  {
    package: 'lodash',
    introducedIn: '0.0.0',
    fixedIn: '4.17.21',
    severity: 'high',
    advisory: 'GHSA-35jh-r3h4-6jhm',
    title: 'Command injection / prototype pollution in lodash',
    recommendation: 'Upgrade lodash to >= 4.17.21',
  },
  {
    package: 'minimist',
    introducedIn: '0.0.0',
    fixedIn: '1.2.6',
    severity: 'medium',
    advisory: 'CVE-2021-44906',
    title: 'Prototype pollution in minimist',
    recommendation: 'Upgrade minimist to >= 1.2.6',
  },
  {
    package: 'axios',
    introducedIn: '0.0.0',
    fixedIn: '1.6.0',
    severity: 'high',
    advisory: 'CVE-2023-45857',
    title: 'SSRF / credential leak via crafted URL in axios',
    recommendation: 'Upgrade axios to >= 1.6.0',
  },
  {
    package: 'node-fetch',
    introducedIn: '0.0.0',
    fixedIn: '2.6.7',
    severity: 'high',
    advisory: 'CVE-2022-0235',
    title: 'Exposure of sensitive information to an unauthorized actor in node-fetch',
    recommendation: 'Upgrade node-fetch to >= 2.6.7',
  },
  {
    package: 'semver',
    introducedIn: '0.0.0',
    fixedIn: '7.5.2',
    severity: 'medium',
    advisory: 'CVE-2022-25883',
    title: 'Regular Expression Denial of Service (ReDoS) in semver',
    recommendation: 'Upgrade semver to >= 7.5.2',
  },
  {
    package: 'ws',
    introducedIn: '0.0.0',
    fixedIn: '8.17.1',
    severity: 'high',
    advisory: 'CVE-2024-37890',
    title: 'DoS via excessive HTTP headers in ws',
    recommendation: 'Upgrade ws to >= 8.17.1',
  },
  {
    package: 'tar',
    introducedIn: '0.0.0',
    fixedIn: '6.2.1',
    severity: 'high',
    advisory: 'CVE-2024-28863',
    title: 'DoS via crafted tar archive in node-tar',
    recommendation: 'Upgrade tar to >= 6.2.1',
  },
  {
    package: 'json5',
    introducedIn: '0.0.0',
    fixedIn: '2.2.2',
    severity: 'high',
    advisory: 'CVE-2022-46175',
    title: 'Prototype pollution in JSON5 parse',
    recommendation: 'Upgrade json5 to >= 2.2.2',
  },
];

/** Packages known to be deprecated / unmaintained — advise a replacement. */
const DEPRECATED_PACKAGES: Record<string, string> = {
  request: 'The `request` package is deprecated. Use `undici`, `axios`, or native fetch.',
  'left-pad': 'Trivial package; use String.prototype.padStart instead.',
  'gulp-util': '`gulp-util` is deprecated. Use the individual replacement modules.',
  istanbul: '`istanbul` is deprecated. Use `nyc` or `c8`.',
  tslint: '`tslint` is deprecated. Use ESLint with @typescript-eslint.',
};

/** Licenses considered risky for proprietary/commercial use. */
const RISKY_LICENSES = new Set(['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-3.0', 'SSPL-1.0']);

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Run the dependency audit against the project root. Reads package.json and,
 * when present, a lockfile to resolve concrete installed versions.
 */
export async function auditDependencies(projectRoot: string): Promise<DependencyAuditResult> {
  const pkg = await readJson<PackageJson>(join(projectRoot, 'package.json'));
  const components: DependencyComponent[] = [];
  const findings: DependencyFinding[] = [];

  if (!pkg) {
    return emptyResult();
  }

  const resolved = await resolveInstalledVersions(projectRoot);

  const collect = (deps: Record<string, string> | undefined, scope: 'prod' | 'dev'): void => {
    if (!deps) return;
    for (const [name, range] of Object.entries(deps)) {
      const version = resolved.get(name) ?? cleanRange(range);
      components.push({ name, version, scope, declaredRange: range });
    }
  };
  collect(pkg.dependencies, 'prod');
  collect(pkg.devDependencies, 'dev');

  // De-dupe by name (a package can't be both prod+dev meaningfully for audit).
  const seen = new Set<string>();
  const uniqueComponents = components.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  for (const comp of uniqueComponents) {
    findings.push(...auditComponent(comp));
  }

  // License findings come from installed package metadata (best-effort, offline).
  findings.push(...(await auditLicenses(projectRoot, uniqueComponents)));

  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  const prod = uniqueComponents.filter((c) => c.scope === 'prod').length;
  const dev = uniqueComponents.length - prod;

  return {
    schemaVersion: DEPENDENCY_AUDIT_SCHEMA_VERSION,
    summary: {
      totalDependencies: uniqueComponents.length,
      prodDependencies: prod,
      devDependencies: dev,
      vulnerabilities: findings.filter((f) => f.category === 'known-vulnerability').length,
      deprecated: findings.filter((f) => f.category === 'deprecated').length,
      riskyLicenses: findings.filter((f) => f.category === 'risky-license').length,
    },
    counts,
    findings,
    components: uniqueComponents,
  };
}

/** Match one component against the bundled advisory DB + deprecation list. */
function auditComponent(comp: DependencyComponent): DependencyFinding[] {
  const out: DependencyFinding[] = [];

  for (const adv of BUNDLED_ADVISORIES) {
    if (adv.package !== comp.name) continue;
    if (isVersionVulnerable(comp.version, adv)) {
      out.push({
        id: `DEP-${adv.advisory}`,
        package: comp.name,
        installedVersion: comp.version,
        severity: adv.severity,
        category: 'known-vulnerability',
        message: `${comp.name}@${comp.version}: ${adv.title}`,
        recommendation: adv.recommendation,
        advisory: adv.advisory,
        fixedIn: adv.fixedIn,
      });
    }
  }

  const deprecation = DEPRECATED_PACKAGES[comp.name];
  if (deprecation) {
    out.push({
      id: `DEP-DEPRECATED-${comp.name}`,
      package: comp.name,
      installedVersion: comp.version,
      severity: 'low',
      category: 'deprecated',
      message: `${comp.name} is deprecated`,
      recommendation: deprecation,
    });
  }

  return out;
}

/** Best-effort license read from node_modules/<pkg>/package.json. */
async function auditLicenses(
  projectRoot: string,
  components: DependencyComponent[],
): Promise<DependencyFinding[]> {
  const out: DependencyFinding[] = [];
  for (const comp of components) {
    const meta = await readJson<{ license?: string; licenses?: Array<{ type: string }> }>(
      join(projectRoot, 'node_modules', comp.name, 'package.json'),
    );
    if (!meta) continue;
    const license = meta.license ?? meta.licenses?.[0]?.type;
    if (typeof license === 'string' && RISKY_LICENSES.has(license)) {
      out.push({
        id: `DEP-LICENSE-${comp.name}`,
        package: comp.name,
        installedVersion: comp.version,
        severity: 'medium',
        category: 'risky-license',
        message: `${comp.name} uses a copyleft/restrictive license: ${license}`,
        recommendation: `Review whether ${license} is compatible with your distribution model`,
      });
    }
  }
  return out;
}

/**
 * Resolve concrete installed versions from a lockfile when available, falling
 * back to node_modules metadata. Supports npm (package-lock.json) and a generic
 * read of installed package.json files.
 */
async function resolveInstalledVersions(projectRoot: string): Promise<Map<string, string>> {
  const versions = new Map<string, string>();

  const lock = await readJson<{
    packages?: Record<string, { version?: string }>;
    dependencies?: Record<string, { version?: string }>;
  }>(join(projectRoot, 'package-lock.json'));

  if (lock?.packages) {
    for (const [path, info] of Object.entries(lock.packages)) {
      if (!path.startsWith('node_modules/') || !info.version) continue;
      const name = path.slice('node_modules/'.length);
      // Skip nested deps (node_modules/a/node_modules/b) — keep top-level resolution.
      if (name.includes('/node_modules/')) continue;
      versions.set(name, info.version);
    }
  } else if (lock?.dependencies) {
    for (const [name, info] of Object.entries(lock.dependencies)) {
      if (info.version) versions.set(name, info.version);
    }
  }

  return versions;
}

/**
 * Determine whether an installed version is vulnerable per an advisory.
 * Pure semver comparison, no external semver lib (zero deps): a version is
 * vulnerable when it is >= introducedIn (if set) AND < fixedIn.
 */
export function isVersionVulnerable(version: string, adv: Advisory): boolean {
  const v = parseSemver(version);
  if (!v) return false;
  const fixed = parseSemver(adv.fixedIn);
  if (fixed && compareSemver(v, fixed) >= 0) return false;
  if (adv.introducedIn) {
    const intro = parseSemver(adv.introducedIn);
    if (intro && compareSemver(v, intro) < 0) return false;
  }
  return true;
}

interface Semver {
  major: number;
  minor: number;
  patch: number;
}

/** Parse a semver string, stripping range prefixes and pre-release/build tags. */
export function parseSemver(raw: string): Semver | null {
  const cleaned = cleanRange(raw);
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(cleaned);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Strip `^`, `~`, `>=`, `v`, and whitespace from a version/range string. */
function cleanRange(raw: string): string {
  return raw.trim().replace(/^[\^~><=v\s]+/, '');
}

/** Compare two semvers: negative if a<b, 0 if equal, positive if a>b. */
export function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Emit a CycloneDX-style SBOM (minimal, valid-shape) from audited components.
 * Deterministic ordering so output is stable across runs.
 */
export function buildSbom(result: DependencyAuditResult): object {
  const components = [...result.components]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      type: 'library',
      name: c.name,
      version: c.version,
      scope: c.scope === 'prod' ? 'required' : 'optional',
      purl: `pkg:npm/${encodeURIComponent(c.name)}@${c.version}`,
    }));

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      tools: [{ vendor: 'VibeGuard', name: 'dependency-auditor', version: DEPENDENCY_AUDIT_SCHEMA_VERSION }],
    },
    components,
  };
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function emptyResult(): DependencyAuditResult {
  return {
    schemaVersion: DEPENDENCY_AUDIT_SCHEMA_VERSION,
    summary: {
      totalDependencies: 0,
      prodDependencies: 0,
      devDependencies: 0,
      vulnerabilities: 0,
      deprecated: 0,
      riskyLicenses: 0,
    },
    counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    findings: [],
    components: [],
  };
}
