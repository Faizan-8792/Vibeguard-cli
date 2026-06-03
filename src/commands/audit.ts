import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveFiles } from '../utils/glob-resolver.js';
import { auditDependencies, buildSbom, type DependencyAuditResult } from '../engines/dependency-auditor.js';
import { analyzeTaint, type TaintScanResult } from '../engines/taint-analyzer.js';
import { scanMisconfig, type MisconfigScanResult } from '../engines/misconfig-scanner.js';
import { scanSecurity } from '../engines/security-scanner.js';
import { scanAttacks } from '../engines/attack-scanner.js';
import { emitJson } from '../utils/json-output.js';
import { header, severityBadge, filePath, divider, summaryLine, statusIcon, brand } from '../utils/ui.js';
import type { Severity } from '../engines/security-types.js';
import type { CommandContext } from '../context.js';

export interface AuditCommandOptions {
  /** Minimum severity to report (filters output). */
  minSeverity?: string;
  /** Write a CycloneDX SBOM to .codescout/sbom.json. */
  sbom: boolean;
}

export const AUDIT_SCHEMA_VERSION = '1.0.0';

const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/**
 * Unified security audit: dependency SCA + taint dataflow + misconfiguration +
 * secret + attack scans, aggregated into one risk summary. Best-of-Trivy +
 * Semgrep + CodeQL, fully local.
 */
export async function runAudit(ctx: CommandContext, opts: AuditCommandOptions): Promise<void> {
  const { config, logger, projectRoot, options } = ctx;

  logger.startSpinner('Running unified security audit...');
  const files = await resolveFiles(projectRoot, config.effectiveInclude, config.effectiveSkipSet);

  const [deps, taint, misconfig, security, attacks] = await Promise.all([
    auditDependencies(projectRoot),
    analyzeTaint(projectRoot, files),
    scanMisconfig(projectRoot, files),
    scanSecurity(projectRoot, files, config),
    scanAttacks(projectRoot, files, config),
  ]);
  logger.stopSpinner(true);

  const totals = aggregateCounts(deps, taint, misconfig, security.counts, attacks.counts);
  const riskScore = computeRiskScore(totals);

  let sbomWritten: string | null = null;
  if (opts.sbom) {
    const sbom = buildSbom(deps);
    const sbomPath = join(projectRoot, '.codescout', 'sbom.json');
    await writeFile(sbomPath, JSON.stringify(sbom, null, 2) + '\n', 'utf-8');
    sbomWritten = '.codescout/sbom.json';
  }

  if (options.json) {
    emitJson({
      schemaVersion: AUDIT_SCHEMA_VERSION,
      riskScore,
      totals,
      dependencies: deps,
      taint,
      misconfig,
      secrets: { issues: security.issues, counts: security.counts },
      attacks: { findings: attacks.findings, counts: attacks.counts },
      sbom: sbomWritten,
    });
    return;
  }

  renderAuditTerminal(opts, { deps, taint, misconfig, security, attacks, totals, riskScore, sbomWritten });
}

interface RenderData {
  deps: DependencyAuditResult;
  taint: TaintScanResult;
  misconfig: MisconfigScanResult;
  security: Awaited<ReturnType<typeof scanSecurity>>;
  attacks: Awaited<ReturnType<typeof scanAttacks>>;
  totals: Record<Severity, number>;
  riskScore: number;
  sbomWritten: string | null;
}

function renderAuditTerminal(opts: AuditCommandOptions, data: RenderData): void {
  const { deps, taint, misconfig, security, attacks, totals, riskScore, sbomWritten } = data;
  const out: string[] = [];

  out.push(header('Unified Security Audit', '🛡️'));
  out.push('');
  out.push(`  ${brand.muted('Engines:')} ${brand.secondary('dependencies · taint · misconfig · secrets · attacks')}`);
  out.push('');

  const riskColor = riskScore >= 80 ? 'success' : riskScore >= 50 ? 'warning' : 'danger';
  const riskIcon = riskColor === 'success' ? '✔' : riskColor === 'warning' ? '⚠' : '✖';
  out.push(`  ${brand[riskColor].bold(riskIcon)} ${brand[riskColor].bold(`Security Score: ${riskScore}/100`)}`);
  out.push('');
  out.push(summaryLine([
    { label: 'Critical', value: totals.critical, color: totals.critical > 0 ? 'danger' : 'muted' },
    { label: 'High', value: totals.high, color: totals.high > 0 ? 'warning' : 'muted' },
    { label: 'Medium', value: totals.medium, color: 'muted' },
    { label: 'Low', value: totals.low, color: 'muted' },
  ]));
  out.push('');
  out.push(divider());
  out.push('');

  // Per-engine breakdown
  out.push(`  ${brand.primary.bold('📦 Dependencies')} ${brand.muted(`(${deps.summary.totalDependencies} deps)`)}`);
  if (deps.findings.length === 0) {
    out.push(`    ${statusIcon('success')} ${brand.success('No known-vulnerable, deprecated, or risky-license dependencies')}`);
  } else {
    for (const f of filterBySeverity(deps.findings, opts.minSeverity).slice(0, 8)) {
      out.push(`    ${severityBadge(f.severity)} ${brand.secondary(f.package)} ${brand.muted(f.installedVersion)} — ${f.message.replace(`${f.package}@${f.installedVersion}: `, '')}`);
      out.push(`      ${statusIcon('info')} ${brand.secondary(f.recommendation)}`);
    }
  }
  out.push('');

  out.push(`  ${brand.primary.bold('🌊 Taint Dataflow')} ${brand.muted('(source → sink)')}`);
  if (taint.findings.length === 0) {
    out.push(`    ${statusIcon('success')} ${brand.success('No untrusted-input flows into dangerous sinks')}`);
  } else {
    for (const f of filterBySeverity(taint.findings, opts.minSeverity).slice(0, 8)) {
      out.push(`    ${severityBadge(f.severity)} ${brand.primary(f.rule)} ${filePath(f.file)}${brand.muted(':' + f.line)} ${brand.muted(`(src L${f.sourceLine}, conf ${Math.round(f.confidence * 100)}%)`)}`);
      out.push(`      ${statusIcon('info')} ${brand.secondary(f.recommendation)}`);
    }
  }
  out.push('');

  out.push(`  ${brand.primary.bold('⚙️ Misconfiguration')} ${brand.muted(`(${misconfig.filesScanned} config files)`)}`);
  if (misconfig.findings.length === 0) {
    out.push(`    ${statusIcon('success')} ${brand.success('No insecure configuration detected')}`);
  } else {
    for (const f of filterBySeverity(misconfig.findings, opts.minSeverity).slice(0, 8)) {
      out.push(`    ${severityBadge(f.severity)} ${filePath(f.file)}${brand.muted(':' + f.line)} — ${f.message}`);
      out.push(`      ${statusIcon('info')} ${brand.secondary(f.recommendation)}`);
    }
  }
  out.push('');

  out.push(`  ${brand.primary.bold('🔒 Secrets & Attacks')}`);
  out.push(`    ${brand.muted('Secret findings:')} ${brand.secondary(String(security.issues.length))}   ${brand.muted('Attack findings:')} ${brand.secondary(String(attacks.findings.length))}`);
  out.push(`    ${brand.muted('Run')} ${brand.secondary('codescout security')} ${brand.muted('and')} ${brand.secondary('codescout attack')} ${brand.muted('for full detail')}`);
  out.push('');

  if (sbomWritten) {
    out.push(divider());
    out.push('');
    out.push(`  ${statusIcon('success')} ${brand.success('SBOM written to')} ${brand.secondary(sbomWritten)}`);
    out.push('');
  }

  out.push(`  ${brand.muted('Tip:')} ${brand.secondary('codescout audit --json')} ${brand.muted('for the full machine-readable report,')} ${brand.secondary('--sbom')} ${brand.muted('to emit an SBOM')}`);
  out.push('');

  process.stdout.write(out.join('\n') + '\n');
}

function filterBySeverity<T extends { severity: Severity }>(items: T[], minSeverity?: string): T[] {
  if (!minSeverity || !(minSeverity in SEV_RANK)) return items;
  const threshold = SEV_RANK[minSeverity as Severity];
  return items.filter((i) => SEV_RANK[i.severity] <= threshold);
}

function aggregateCounts(
  deps: DependencyAuditResult,
  taint: TaintScanResult,
  misconfig: MisconfigScanResult,
  security: Record<Severity, number>,
  attacks: Record<Severity, number>,
): Record<Severity, number> {
  const totals: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const src of [deps.counts, taint.counts, misconfig.counts, security, attacks]) {
    for (const sev of Object.keys(totals) as Severity[]) {
      totals[sev] += src[sev] ?? 0;
    }
  }
  return totals;
}

/**
 * Risk score 0..100. Weighted penalty per severity, clamped. Mirrors the
 * health analyzer's spirit so audit and doctor feel consistent.
 */
export function computeRiskScore(counts: Record<Severity, number>): number {
  const penalty = counts.critical * 25 + counts.high * 12 + counts.medium * 5 + counts.low * 1;
  return Math.max(0, 100 - penalty);
}
