/**
 * Taint Analyzer — lightweight source → sink dataflow for JS/TS.
 *
 * Semgrep/CodeQL-inspired but intentionally simple and zero-dependency: it
 * tracks variables that are assigned from an untrusted *source* (e.g.
 * `req.body`, `process.argv`) and flags when a tainted variable — or a source
 * expression directly — reaches a dangerous *sink* (e.g. `exec`, `query`,
 * `eval`, `innerHTML`) without passing through a known *sanitizer*.
 *
 * Why this beats the single-line regex in attack-scanner:
 *  - It connects an input read on one line to a dangerous use on another line.
 *  - It suppresses findings when the tainted value was sanitized first.
 *
 * Scope: intra-file, line-ordered. It does not do full AST/CFG analysis (that
 * would need a heavyweight parser), so it is deliberately conservative and
 * reports a confidence score the caller can threshold on.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashString } from '../utils/hash-utils.js';
import type { Severity } from './security-types.js';

export interface TaintFinding {
  id: string;
  rule: string;
  severity: Severity;
  file: string;
  line: number;
  sourceLine: number;
  message: string;
  sink: string;
  source: string;
  /** 0..1 — higher means stronger evidence of a real flow. */
  confidence: number;
  snippet: string;
  recommendation: string;
}

export interface TaintScanResult {
  schemaVersion: string;
  findings: TaintFinding[];
  counts: Record<Severity, number>;
}

export const TAINT_SCHEMA_VERSION = '1.0.0';

/** Patterns that introduce untrusted data. */
const SOURCE_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'req.body', regex: /\breq(?:uest)?\.body\b/ },
  { name: 'req.query', regex: /\breq(?:uest)?\.query\b/ },
  { name: 'req.params', regex: /\breq(?:uest)?\.params\b/ },
  { name: 'req.headers', regex: /\breq(?:uest)?\.headers\b/ },
  { name: 'req.cookies', regex: /\breq(?:uest)?\.cookies\b/ },
  { name: 'process.argv', regex: /\bprocess\.argv\b/ },
  { name: 'process.env (user)', regex: /\bprocess\.env\[[^\]]+\]/ },
  { name: 'url query param', regex: /\b(?:searchParams\.get|url\.parse)\b/ },
  { name: 'event.data', regex: /\bevent\.data\b/ },
];

/** Dangerous sinks, keyed by the rule they trigger. */
interface SinkDef {
  rule: string;
  severity: Severity;
  /** Matches the sink call; capture group 1 (if any) is the argument text. */
  regex: RegExp;
  message: string;
  recommendation: string;
}

const SINKS: SinkDef[] = [
  {
    rule: 'command-injection',
    severity: 'critical',
    regex: /\b(?:exec|execSync|spawn|spawnSync|execFile)\s*\(([^)]*)/,
    message: 'Untrusted input flows into a shell/command execution sink',
    recommendation: 'Use execFile with an args array and validate input; never build shell strings from user data',
  },
  {
    rule: 'code-injection',
    severity: 'critical',
    regex: /\b(?:eval|Function)\s*\(([^)]*)/,
    message: 'Untrusted input flows into dynamic code execution (eval/Function)',
    recommendation: 'Remove eval/new Function; parse data with JSON.parse or explicit logic',
  },
  {
    rule: 'sql-injection',
    severity: 'critical',
    regex: /\.(?:query|execute|raw)\s*\(([^)]*)/,
    message: 'Untrusted input flows into a SQL query sink',
    recommendation: 'Use parameterized queries with bound values instead of interpolation',
  },
  {
    rule: 'xss',
    severity: 'high',
    regex: /\.innerHTML\s*=\s*([^;]*)|dangerouslySetInnerHTML/,
    message: 'Untrusted input flows into an HTML injection sink (XSS)',
    recommendation: 'Sanitize with DOMPurify or render via textContent',
  },
  {
    rule: 'ssrf',
    severity: 'high',
    regex: /\b(?:fetch|axios|request|got)\s*(?:\.(?:get|post|put|delete))?\s*\(([^)]*)/,
    message: 'Untrusted input flows into an outbound request URL (SSRF)',
    recommendation: 'Validate the URL against an allowlist; block internal/metadata IP ranges',
  },
  {
    rule: 'path-traversal',
    severity: 'high',
    regex: /\b(?:readFile|readFileSync|createReadStream|sendFile|unlink)\s*\(([^)]*)/,
    message: 'Untrusted input flows into a filesystem path sink (path traversal)',
    recommendation: 'Normalize and confine paths to an allowed base directory',
  },
];

/** Calls that neutralize taint. If the tainted var passes through these, suppress. */
const SANITIZERS = [
  /\bparseInt\b/, /\bNumber\b/, /\bBoolean\b/,
  /\bDOMPurify\b/, /\bsanitize\w*\b/i, /\bescape\w*\b/i,
  /\bvalidate\w*\b/i, /\ballow(?:list|List)\b/, /\bencodeURI(?:Component)?\b/,
  /\bpath\.(?:normalize|resolve|basename)\b/, /\bz\.\w+\b/ /* zod */,
];

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

export async function analyzeTaint(projectRoot: string, files: string[]): Promise<TaintScanResult> {
  const findings: TaintFinding[] = [];

  for (const file of files) {
    if (!SOURCE_FILE.test(file)) continue;
    if (/\.(test|spec)\./.test(file)) continue;

    let content: string;
    try {
      content = await readFile(resolve(projectRoot, file), 'utf-8');
    } catch {
      continue;
    }

    findings.push(...analyzeFileContent(file, content));
  }

  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  return { schemaVersion: TAINT_SCHEMA_VERSION, findings, counts };
}

/** Exposed for unit testing: analyze a single file's content. */
export function analyzeFileContent(file: string, content: string): TaintFinding[] {
  const lines = content.split('\n');
  const findings: TaintFinding[] = [];

  // Map of tainted variable name -> line where it became tainted.
  const tainted = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // 1. Record assignments from a source: `const x = req.body...`
    const assign = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/.exec(line);
    if (assign) {
      const [, varName, rhs] = assign;
      if (matchSource(rhs) && !isSanitized(rhs)) {
        tainted.set(varName, lineNo);
      } else {
        // Reassigned to a clean/sanitized value → clear any prior taint (no-op if absent).
        tainted.delete(varName);
      }
    }

    // 2. Check sinks on this line.
    for (const sink of SINKS) {
      const m = sink.regex.exec(line);
      if (!m) continue;
      const argText = m[1] ?? line;

      // Skip if the sink call itself is sanitized inline.
      if (isSanitized(line)) continue;

      // Case A: a source expression reaches the sink directly on this line.
      const directSource = matchSource(argText);
      // Case B: a previously-tainted variable is used in the sink args.
      const taintedVar = findTaintedVar(argText, tainted);

      if (directSource || taintedVar) {
        const sourceName = directSource ?? 'tainted variable';
        const sourceLine = taintedVar ? tainted.get(taintedVar)! : lineNo;
        const confidence = directSource ? 0.75 : 0.9; // var-flow across lines = stronger signal
        findings.push({
          id: `TAINT-${sink.rule}-${hashString(`${file}:${lineNo}:${sink.rule}`).slice(0, 8)}`,
          rule: sink.rule,
          severity: sink.severity,
          file,
          line: lineNo,
          sourceLine,
          message: sink.message,
          sink: sink.rule,
          source: sourceName,
          confidence,
          snippet: line.trim().slice(0, 120),
          recommendation: sink.recommendation,
        });
        break; // one finding per line is enough
      }
    }
  }

  return findings;
}

function matchSource(text: string): string | null {
  for (const s of SOURCE_PATTERNS) {
    if (s.regex.test(text)) return s.name;
  }
  return null;
}

function isSanitized(text: string): boolean {
  return SANITIZERS.some((re) => re.test(text));
}

/** Return the name of a tainted variable referenced in `text`, if any. */
function findTaintedVar(text: string, tainted: Map<string, number>): string | null {
  for (const name of tainted.keys()) {
    // Word-boundary match so `user` doesn't match `username`.
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text)) return name;
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
