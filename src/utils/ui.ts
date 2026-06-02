import chalk from 'chalk';

// ─── Types ──────────────────────────────────────────────────────────────────
export type BrandColor = 'success' | 'warning' | 'danger' | 'info' | 'muted';

// ─── Box Drawing Characters ─────────────────────────────────────────────────
const BOX = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
};

// ─── Brand Colors ───────────────────────────────────────────────────────────
const brand = {
  primary: chalk.hex('#7C3AED'),    // Purple
  secondary: chalk.hex('#06B6D4'),  // Cyan
  success: chalk.hex('#10B981'),    // Green
  warning: chalk.hex('#F59E0B'),    // Amber
  danger: chalk.hex('#EF4444'),     // Red
  muted: chalk.hex('#6B7280'),      // Gray
  info: chalk.hex('#3B82F6'),       // Blue
  dim: chalk.dim,
};

// ─── Banner ─────────────────────────────────────────────────────────────────
export function banner(): string {
  const logo = brand.primary.bold(`
  ╦  ╦╦╔╗ ╔═╗╔═╗╦ ╦╔═╗╦═╗╔╦╗
  ╚╗╔╝║╠╩╗║╣ ║ ╦║ ║╠═╣╠╦╝ ║║
   ╚╝ ╩╚═╝╚═╝╚═╝╚═╝╩ ╩╩╚══╩╝`);

  const tagline = brand.muted('  Local-only static analysis & AI context packaging\n');
  return logo + '\n' + tagline;
}

// ─── Section Header ─────────────────────────────────────────────────────────
export function header(title: string, icon = '◆'): string {
  const line = brand.muted(BOX.horizontal.repeat(50));
  return `\n  ${brand.primary(icon)} ${chalk.bold(title)}\n  ${line}`;
}

export interface BoxOptions {
  title?: string;
  width?: number;
  borderColor?: typeof chalk;
}

// ─── Box ────────────────────────────────────────────────────────────────────
export function box(content: string, options?: BoxOptions): string {
  const width = options?.width ?? 60;
  const borderFn = options?.borderColor ?? brand.muted;
  const lines = content.split('\n');
  const innerWidth = width - 4;

  let result = '';

  // Top border
  const titleStr = options?.title ? ` ${options.title} ` : '';
  const topPadding = width - 2 - titleStr.length;
  result += `  ${borderFn(BOX.topLeft)}${borderFn(BOX.horizontal)}${brand.primary.bold(titleStr)}${borderFn(BOX.horizontal.repeat(Math.max(0, topPadding - 1)))}${borderFn(BOX.topRight)}\n`;

  // Content lines
  for (const line of lines) {
    const stripped = stripAnsi(line);
    const padding = Math.max(0, innerWidth - stripped.length);
    result += `  ${borderFn(BOX.vertical)} ${line}${' '.repeat(padding)} ${borderFn(BOX.vertical)}\n`;
  }

  // Bottom border
  result += `  ${borderFn(BOX.bottomLeft)}${borderFn(BOX.horizontal.repeat(width - 2))}${borderFn(BOX.bottomRight)}`;

  return result;
}

// ─── Key-Value Pair ─────────────────────────────────────────────────────────
export function keyValue(key: string, value: string, keyWidth = 22): string {
  const paddedKey = key.padEnd(keyWidth);
  return `  ${brand.muted(paddedKey)} ${value}`;
}

// ─── Bar Rendering ──────────────────────────────────────────────────────────
function renderBar(filled: number, total: number, filledColor: typeof chalk): string {
  const empty = total - filled;
  return filledColor('█'.repeat(filled)) + brand.muted('░'.repeat(empty));
}

// ─── Score Bar ──────────────────────────────────────────────────────────────
export function scoreBar(score: number | null, width = 20): string {
  if (score === null) return brand.muted('N/A');

  const filled = Math.round((score / 100) * width);

  let color: typeof chalk;
  if (score >= 80) color = brand.success;
  else if (score >= 50) color = brand.warning;
  else color = brand.danger;

  const bar = renderBar(filled, width, color);
  const label = color.bold(`${score}`);
  return `${bar} ${label}${brand.muted('/100')}`;
}

// ─── Severity Badge ─────────────────────────────────────────────────────────
export function severityBadge(severity: string): string {
  switch (severity) {
    case 'critical': return chalk.bgRed.white.bold(' CRITICAL ');
    case 'high': return chalk.bgHex('#DC2626').white.bold(' HIGH ');
    case 'medium': return chalk.bgHex('#D97706').white.bold(' MEDIUM ');
    case 'low': return chalk.bgHex('#2563EB').white(' LOW ');
    case 'info': return chalk.bgHex('#6B7280').white(' INFO ');
    default: return chalk.bgGray.white(` ${severity.toUpperCase()} `);
  }
}

// ─── Status Indicator ───────────────────────────────────────────────────────
export function statusIcon(status: 'success' | 'warning' | 'error' | 'info'): string {
  switch (status) {
    case 'success': return brand.success('✔');
    case 'warning': return brand.warning('⚠');
    case 'error': return brand.danger('✖');
    case 'info': return brand.info('ℹ');
  }
}

// ─── Table ──────────────────────────────────────────────────────────────────
export interface TableColumn {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

export function table(columns: TableColumn[], rows: string[][]): string {
  let result = '';

  // Header
  const headerLine = columns.map((col) => {
    const text = col.header.padEnd(col.width).slice(0, col.width);
    return brand.muted.bold(text);
  }).join(brand.muted(' │ '));
  result += `  ${headerLine}\n`;

  // Separator
  const sep = columns.map((col) => brand.muted('─'.repeat(col.width))).join(brand.muted('─┼─'));
  result += `  ${sep}\n`;

  // Rows
  for (const row of rows) {
    const rowLine = columns.map((col, i) => {
      const cell = row[i] ?? '';
      const stripped = stripAnsi(cell);
      const padding = Math.max(0, col.width - stripped.length);
      if (col.align === 'right') return ' '.repeat(padding) + cell;
      return cell + ' '.repeat(padding);
    }).join(brand.muted(' │ '));
    result += `  ${rowLine}\n`;
  }

  return result;
}

// ─── Summary Line ───────────────────────────────────────────────────────────
export function summaryLine(items: Array<{ label: string; value: string | number; color?: BrandColor }>): string {
  const parts = items.map((item) => {
    const colorFn = item.color ? brand[item.color] : chalk.white;
    return `${brand.muted(item.label + ':')} ${colorFn.bold(String(item.value))}`;
  });
  return `  ${parts.join(brand.muted('  •  '))}`;
}

// ─── Divider ────────────────────────────────────────────────────────────────
export function divider(width = 56): string {
  return `  ${brand.muted(BOX.horizontal.repeat(width))}`;
}

// ─── Indent ─────────────────────────────────────────────────────────────────
export function indent(text: string, spaces = 4): string {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line) => pad + line).join('\n');
}

// ─── File Path ──────────────────────────────────────────────────────────────
export function filePath(path: string): string {
  const parts = path.split('/');
  const file = parts.pop() ?? '';
  const dir = parts.join('/');
  return dir ? brand.muted(dir + '/') + chalk.white(file) : chalk.white(file);
}

// ─── Count Badge ────────────────────────────────────────────────────────────
export function countBadge(count: number, color: BrandColor = 'muted'): string {
  return brand[color](`(${count})`);
}

// ─── Progress ───────────────────────────────────────────────────────────────
export function progressText(current: number, total: number, label: string): string {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const barWidth = 20;
  const filled = Math.round((pct / 100) * barWidth);
  const bar = renderBar(filled, barWidth, brand.secondary);
  return `  ${bar} ${brand.muted(`${pct}%`)} ${label}`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

// ─── Quick Start Guide ───────────────────────────────────────────────────────
export function quickStart(): string {
  const lines: string[] = [];

  lines.push(`  ${brand.primary.bold('Quick Start')}`);
  lines.push('');
  lines.push(`  ${brand.secondary('$')} ${chalk.white('npx vibeguard --scan')}       ${brand.muted('Scan for security issues')}`);
  lines.push(`  ${brand.secondary('$')} ${chalk.white('npx vibeguard --health')}     ${brand.muted('Get project health score')}`);
  lines.push(`  ${brand.secondary('$')} ${chalk.white('npx vibeguard --graph')}      ${brand.muted('Build dependency graph')}`);
  lines.push(`  ${brand.secondary('$')} ${chalk.white('npx vibeguard --dead')}       ${brand.muted('Detect dead code')}`);
  lines.push('');
  lines.push(`  ${brand.primary.bold('Commands')}`);
  lines.push('');
  lines.push(`  ${brand.secondary('$')} ${chalk.white('vibeguard init')}             ${brand.muted('Initialize configuration')}`);
  lines.push(`  ${brand.secondary('$')} ${chalk.white('vibeguard map')}              ${brand.muted('Build dependency graph')}`);
  lines.push(`  ${brand.secondary('$')} ${chalk.white('vibeguard security')}         ${brand.muted('Security scan')}`);
  lines.push(`  ${brand.secondary('$')} ${chalk.white('vibeguard doctor')}           ${brand.muted('Project health score')}`);
  lines.push(`  ${brand.secondary('$')} ${chalk.white('vibeguard pack "task"')}      ${brand.muted('AI context package')}`);
  lines.push(`  ${brand.secondary('$')} ${chalk.white('vibeguard clean --plan')}     ${brand.muted('Dead code detection')}`);
  lines.push(`  ${brand.secondary('$')} ${chalk.white('vibeguard trash list')}       ${brand.muted('Manage deleted files')}`);
  lines.push('');
  lines.push(`  ${brand.muted('Add --json to any command for machine-readable output')}`);
  lines.push(`  ${brand.muted('Add --help to any command for detailed usage')}`);
  lines.push('');

  return lines.join('\n');
}

export { brand };
