/**
 * Misconfiguration Scanner — Trivy-IaC-inspired, local & zero-network.
 *
 * Scans configuration/infrastructure files for insecure settings: Dockerfiles,
 * `.env` files, CI workflow YAML, and TypeScript/runtime config. These are the
 * "config" half of security that line-level source scanning misses.
 *
 * Each check is a small, file-type-scoped rule with a clear remediation. The
 * scanner reads only files that already exist in the resolved set plus a few
 * well-known config paths at the project root.
 */
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { hashString } from '../utils/hash-utils.js';
import type { Severity } from './security-types.js';

export interface MisconfigFinding {
  id: string;
  category: string;
  severity: Severity;
  file: string;
  line: number;
  message: string;
  recommendation: string;
  snippet: string;
}

export interface MisconfigScanResult {
  schemaVersion: string;
  findings: MisconfigFinding[];
  counts: Record<Severity, number>;
  filesScanned: number;
}

export const MISCONFIG_SCHEMA_VERSION = '1.0.0';

type FileKind = 'dockerfile' | 'env' | 'ci' | 'tsconfig' | 'sshd' | 'nginx' | 'mysql' | 'other';

interface MisconfigRule {
  code: string;
  kind: FileKind;
  category: string;
  severity: Severity;
  regex: RegExp;
  message: string;
  recommendation: string;
  /** If present anywhere in the file, suppress this rule (mitigation present). */
  mitigatedBy?: RegExp;
}

const RULES: MisconfigRule[] = [
  // ─── Dockerfile ────────────────────────────────────────────────────────
  {
    code: 'DOCKER-001',
    kind: 'dockerfile',
    category: 'container',
    severity: 'high',
    regex: /^\s*USER\s+root\s*$/im,
    message: 'Container runs as root (USER root)',
    recommendation: 'Add a non-root USER before the entrypoint to drop privileges',
  },
  {
    code: 'DOCKER-002',
    kind: 'dockerfile',
    category: 'container',
    severity: 'medium',
    regex: /:latest\b/,
    message: 'Base image pinned to :latest — non-reproducible and may pull in vulnerabilities',
    recommendation: 'Pin the base image to a specific version/digest',
  },
  {
    code: 'DOCKER-003',
    kind: 'dockerfile',
    category: 'secrets',
    severity: 'high',
    regex: /^\s*ENV\s+\w*(?:PASSWORD|SECRET|TOKEN|API_KEY)\w*\s*=?\s*\S+/im,
    message: 'Secret baked into an image layer via ENV',
    recommendation: 'Pass secrets at runtime (build secrets / env at deploy), never bake into layers',
  },
  {
    code: 'DOCKER-004',
    kind: 'dockerfile',
    category: 'container',
    severity: 'low',
    regex: /\bcurl\b[^\n|]*\|\s*(?:sh|bash)\b/,
    message: 'Piping a remote script straight into a shell during build',
    recommendation: 'Download, verify checksum, then execute — avoid curl | sh',
  },
  // ─── .env ──────────────────────────────────────────────────────────────
  {
    code: 'ENV-001',
    kind: 'env',
    category: 'config',
    severity: 'medium',
    regex: /^\s*NODE_ENV\s*=\s*development\s*$/im,
    message: 'NODE_ENV=development committed in an .env file',
    recommendation: 'Use NODE_ENV=production for deployed environments',
  },
  {
    code: 'ENV-002',
    kind: 'env',
    category: 'config',
    severity: 'high',
    regex: /^\s*(?:DEBUG|FLASK_DEBUG|DJANGO_DEBUG)\s*=\s*(?:1|true|True|\*)\s*$/im,
    message: 'Debug mode enabled in an .env file',
    recommendation: 'Disable debug mode outside local development',
  },
  {
    code: 'ENV-003',
    kind: 'env',
    category: 'transport',
    severity: 'medium',
    regex: /^\s*\w*(?:URL|URI|ENDPOINT)\w*\s*=\s*http:\/\//im,
    message: 'Plaintext http:// endpoint configured',
    recommendation: 'Use https:// for all external endpoints',
  },
  // ─── CI workflows ──────────────────────────────────────────────────────
  {
    code: 'CI-001',
    kind: 'ci',
    category: 'supply-chain',
    severity: 'medium',
    regex: /uses:\s*[^@\s]+@(?:main|master|v\d+)\s*$/im,
    message: 'CI action pinned to a moving ref (branch/major tag) — supply-chain risk',
    recommendation: 'Pin third-party actions to a full commit SHA',
  },
  {
    code: 'CI-002',
    kind: 'ci',
    category: 'permissions',
    severity: 'medium',
    regex: /permissions:\s*write-all/i,
    message: 'CI workflow grants write-all permissions',
    recommendation: 'Grant least-privilege permissions per job',
  },
  {
    code: 'CI-003',
    kind: 'ci',
    category: 'injection',
    severity: 'high',
    regex: /run:\s*[^\n]*\$\{\{\s*github\.event\.(?:issue|pull_request|comment|head_ref)/i,
    message: 'Untrusted GitHub event data interpolated into a run step — CI script injection',
    recommendation: 'Pass event data via env vars and quote them; never interpolate directly into run:',
  },
  // ─── tsconfig / runtime ────────────────────────────────────────────────
  {
    code: 'TSCONFIG-001',
    kind: 'tsconfig',
    category: 'hardening',
    severity: 'low',
    regex: /"strict"\s*:\s*false/,
    message: 'TypeScript strict mode disabled — weaker type-safety guarantees',
    recommendation: 'Enable "strict": true to catch more bugs at compile time',
  },
  // ─── SSH server hardening (sshd_config) — dev-sec/ssh-baseline inspired ──
  {
    code: 'SSH-001',
    kind: 'sshd',
    category: 'hardening',
    severity: 'critical',
    regex: /^\s*PermitRootLogin\s+(?:yes|prohibit-password)\b/im,
    message: 'SSH permits root login',
    recommendation: 'Set "PermitRootLogin no" and use a sudo-enabled non-root user',
  },
  {
    code: 'SSH-002',
    kind: 'sshd',
    category: 'hardening',
    severity: 'high',
    regex: /^\s*PasswordAuthentication\s+yes\b/im,
    message: 'SSH password authentication enabled — brute-force exposure',
    recommendation: 'Set "PasswordAuthentication no" and use key-based auth',
  },
  {
    code: 'SSH-003',
    kind: 'sshd',
    category: 'hardening',
    severity: 'high',
    regex: /^\s*PermitEmptyPasswords\s+yes\b/im,
    message: 'SSH allows empty passwords',
    recommendation: 'Set "PermitEmptyPasswords no"',
  },
  {
    code: 'SSH-004',
    kind: 'sshd',
    category: 'hardening',
    severity: 'medium',
    regex: /^\s*X11Forwarding\s+yes\b/im,
    message: 'SSH X11 forwarding enabled — widens attack surface',
    recommendation: 'Set "X11Forwarding no" unless explicitly required',
  },
  {
    code: 'SSH-005',
    kind: 'sshd',
    category: 'hardening',
    severity: 'medium',
    regex: /^\s*Protocol\s+1\b/im,
    message: 'SSH protocol 1 enabled — cryptographically broken',
    recommendation: 'Use protocol 2 only (remove the Protocol 1 directive)',
  },
  // ─── nginx hardening — dev-sec/nginx-baseline inspired ──────────────────
  {
    code: 'NGINX-001',
    kind: 'nginx',
    category: 'hardening',
    severity: 'medium',
    regex: /^\s*server_tokens\s+on\s*;/im,
    message: 'nginx server_tokens on — leaks version in responses/errors',
    recommendation: 'Set "server_tokens off;" to hide the nginx version',
  },
  {
    code: 'NGINX-002',
    kind: 'nginx',
    category: 'transport',
    severity: 'high',
    regex: /ssl_protocols\s+[^;]*(?:SSLv2|SSLv3|TLSv1|TLSv1\.1)\b/i,
    message: 'nginx enables a weak TLS/SSL protocol (SSLv2/3 or TLS 1.0/1.1)',
    recommendation: 'Restrict to "ssl_protocols TLSv1.2 TLSv1.3;"',
  },
  // ─── MySQL / database config hardening ──────────────────────────────────
  {
    code: 'MYSQL-001',
    kind: 'mysql',
    category: 'hardening',
    severity: 'high',
    regex: /^\s*skip[-_]grant[-_]tables\b/im,
    message: 'MySQL skip-grant-tables set — disables all authentication',
    recommendation: 'Remove skip-grant-tables; never run a database without privilege checks',
  },
  {
    code: 'MYSQL-002',
    kind: 'mysql',
    category: 'hardening',
    severity: 'medium',
    regex: /^\s*local[-_]infile\s*=\s*1\b/im,
    message: 'MySQL local-infile enabled — allows reading local files via LOAD DATA',
    recommendation: 'Set "local-infile=0" unless explicitly needed',
  },
  {
    code: 'MYSQL-003',
    kind: 'mysql',
    category: 'transport',
    severity: 'medium',
    regex: /^\s*skip[-_]ssl\b/im,
    message: 'MySQL skip-ssl set — connections are unencrypted',
    recommendation: 'Remove skip-ssl and require TLS for client connections',
  },
];

/** Classify a file by name so we apply only relevant rules. */
export function classifyFile(file: string): FileKind {
  const name = basename(file).toLowerCase();
  if (name === 'dockerfile' || name.startsWith('dockerfile.') || name.endsWith('.dockerfile')) {
    return 'dockerfile';
  }
  if (name === '.env' || name.startsWith('.env.')) return 'env';
  if (name === 'tsconfig.json' || /^tsconfig\..*\.json$/.test(name)) return 'tsconfig';
  if (name === 'sshd_config' || name === 'ssh_config') return 'sshd';
  if (name === 'my.cnf' || name === 'mysqld.cnf' || name === 'mysql.cnf') return 'mysql';
  if (name === 'nginx.conf' || (name.endsWith('.conf') && (file.includes('nginx') || file.includes('sites-available') || file.includes('sites-enabled')))) {
    return 'nginx';
  }
  if (/\.ya?ml$/.test(name) && (file.includes('.github/workflows') || file.includes('.gitlab') || name.includes('ci'))) {
    return 'ci';
  }
  return 'other';
}

/** Well-known config files to always check, even if outside the resolved set. */
const ALWAYS_CHECK = [
  'Dockerfile', '.env', '.env.local', '.env.production', 'tsconfig.json',
  'sshd_config', 'nginx.conf', 'my.cnf',
];

export async function scanMisconfig(projectRoot: string, files: string[]): Promise<MisconfigScanResult> {
  const findings: MisconfigFinding[] = [];
  const candidates = new Set<string>([...files, ...ALWAYS_CHECK]);

  let filesScanned = 0;
  for (const file of candidates) {
    const kind = classifyFile(file);
    if (kind === 'other') continue;

    let content: string;
    try {
      content = await readFile(resolve(projectRoot, file), 'utf-8');
    } catch {
      continue;
    }
    filesScanned++;

    const lines = content.split('\n');
    for (const rule of RULES) {
      if (rule.kind !== kind) continue;
      if (rule.mitigatedBy && rule.mitigatedBy.test(content)) continue;

      const re = new RegExp(rule.regex.source, rule.regex.flags.includes('g') ? rule.regex.flags : rule.regex.flags + 'g');
      let match: RegExpExecArray | null;
      let perRule = 0;
      while ((match = re.exec(content)) !== null) {
        const lineNo = content.slice(0, match.index).split('\n').length;
        findings.push({
          id: `MIS-${rule.code}-${hashString(`${file}:${lineNo}:${rule.code}`).slice(0, 8)}`,
          category: rule.category,
          severity: rule.severity,
          file,
          line: lineNo,
          message: rule.message,
          recommendation: rule.recommendation,
          snippet: (lines[lineNo - 1] ?? '').trim().slice(0, 120),
        });
        if (++perRule >= 5) break;
        if (!re.global) break;
      }
    }
  }

  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  return { schemaVersion: MISCONFIG_SCHEMA_VERSION, findings, counts, filesScanned };
}
