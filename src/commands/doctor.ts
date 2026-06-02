import { analyzeHealth, type HealthResult } from '../engines/health-analyzer.js';
import { emitJson } from '../utils/json-output.js';
import { header, scoreBar, keyValue, divider, summaryLine, statusIcon, brand, type BrandColor } from '../utils/ui.js';
import type { CavemanLevel } from '../engines/caveman.js';
import type { CommandContext } from '../context.js';

/** Caveman status fold-in (informational, not part of the health score). */
interface CavemanSummary {
  enabled: boolean;
  level: CavemanLevel;
  estimatedSavingsPct: number;
}

/** Dependency-audit fold-in — quick supply-chain signal. */
interface DependencySummary {
  total: number;
  vulnerabilities: number;
  deprecated: number;
  riskyLicenses: number;
}

type HealthGrade = Extract<BrandColor, 'success' | 'warning' | 'danger'>;

const HEALTH_ICON: Record<HealthGrade, string> = {
  success: '✔',
  warning: '⚠',
  danger: '✖',
};

/** Map a 0-100 score to a brand grade. Single source for the 80/50 thresholds. */
function healthGrade(score: number): HealthGrade {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

export async function runDoctor(ctx: CommandContext): Promise<void> {
  const { config, logger, projectRoot, options } = ctx;

  logger.startSpinner('Analyzing project health...');

  const result = await analyzeHealth(config, projectRoot, (percent, label) => {
    logger.updateSpinner(`[${percent}%] ${label}`);
  });

  logger.stopSpinner(true);

  const { loadCavemanState, estimatedSavingsPct } = await import('../engines/caveman.js');
  const cavemanState = await loadCavemanState(projectRoot);
  const caveman: CavemanSummary = {
    enabled: cavemanState.enabled,
    level: cavemanState.level,
    estimatedSavingsPct: cavemanState.enabled ? estimatedSavingsPct(cavemanState.level) : 0,
  };

  // Lightweight dependency audit fold-in — surfaces known-vulnerable deps in the
  // health report without running the full unified audit.
  const { auditDependencies } = await import('../engines/dependency-auditor.js');
  const depAudit = await auditDependencies(projectRoot);
  const dependencies: DependencySummary = {
    total: depAudit.summary.totalDependencies,
    vulnerabilities: depAudit.summary.vulnerabilities,
    deprecated: depAudit.summary.deprecated,
    riskyLicenses: depAudit.summary.riskyLicenses,
  };

  if (options.json) {
    emitJson({
      summary: result.summary,
      issues: result.issues,
      warnings: result.warnings,
      caveman,
      dependencies,
    });
    return;
  }

  process.stdout.write(renderReport(result, caveman, dependencies) + '\n');
}

/** Render the human-readable health report. */
function renderReport(result: HealthResult, caveman: CavemanSummary, dependencies: DependencySummary): string {
  const output: string[] = [];

  output.push(header('Project Health Report', '🏥'));
  output.push('');

  // Overall score prominently
  const grade = healthGrade(result.summary.projectHealth);
  output.push(`  ${brand[grade].bold(HEALTH_ICON[grade])} ${brand[grade].bold(`Overall Health: ${result.summary.projectHealth}/100`)}`);
  output.push('');

  // Sub-scores with bars
  output.push(keyValue('Security', scoreBar(result.summary.security)));
  output.push(keyValue('Dead Code', scoreBar(result.summary.deadCode)));
  output.push(keyValue('Architecture', scoreBar(result.summary.architecture)));
  output.push(keyValue('Context Efficiency', scoreBar(result.summary.contextEfficiency)));
  output.push('');

  // Caveman Mode status — informational, not part of the health score.
  output.push(keyValue(
    'Caveman Mode',
    caveman.enabled
      ? brand.success(`on (${caveman.level}, ~${caveman.estimatedSavingsPct}% output savings)`)
      : brand.muted('off — enable with `vibeguard caveman on`'),
  ));
  // Dependency audit fold-in — quick supply-chain signal.
  output.push(keyValue(
    'Dependencies',
    dependencies.vulnerabilities > 0
      ? brand.danger(`${dependencies.vulnerabilities} vulnerable`) + brand.muted(` / ${dependencies.total} total — run \`vibeguard audit\``)
      : brand.success(`${dependencies.total} scanned, 0 known-vulnerable`),
  ));
  output.push('');

  // Issues summary
  if (result.issues.length > 0) {
    output.push(divider());
    output.push('');
    const counts = {
      critical: result.issues.filter((i) => i.severity === 'critical').length,
      high: result.issues.filter((i) => i.severity === 'high').length,
      medium: result.issues.filter((i) => i.severity === 'medium').length,
      low: result.issues.filter((i) => i.severity === 'low').length,
    };
    output.push(summaryLine([
      { label: 'Critical', value: counts.critical, color: counts.critical > 0 ? 'danger' : 'muted' },
      { label: 'High', value: counts.high, color: counts.high > 0 ? 'warning' : 'muted' },
      { label: 'Medium', value: counts.medium, color: 'muted' },
      { label: 'Low', value: counts.low, color: 'muted' },
    ]));
  }

  // Warnings
  if (result.warnings.length > 0) {
    output.push('');
    for (const w of result.warnings) {
      output.push(`  ${statusIcon('warning')} ${brand.muted(w)}`);
    }
  }

  output.push('');
  return output.join('\n');
}
