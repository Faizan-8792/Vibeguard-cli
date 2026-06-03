import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LLMClient, type LLMMessage } from './llm-provider.js';
import type { LLMCredentials } from '../storage/credentials-store.js';
import type { AttackFinding } from './attack-scanner.js';
import type { SecurityIssue } from './security-scanner.js';

export interface AIAdvisorResult {
  summary: string;
  additionalFindings: Array<{
    file: string;
    attackType: string;
    severity: string;
    description: string;
    fix: string;
  }>;
  prioritizedFixes: string[];
  tokensUsed: number;
  model: string;
}

const SYSTEM_PROMPT = `You are CodeScout's senior application-security auditor. You receive a compact summary of a codebase's static-analysis findings plus small, security-relevant code excerpts.

Your job:
1. Confirm or refine the reported attack risks (DDoS, brute-force, OTP abuse, SQLi, XSS, CSRF, SSRF, command/code injection, path traversal, weak crypto, etc.).
2. Identify any HIGH-CONFIDENCE additional vulnerabilities visible in the excerpts that static rules missed.
3. Give a short, prioritized, actionable remediation plan.

Hard rules:
- Be concise and budget-aware. No preamble, no restating the input.
- Only report issues you are confident about. Do not speculate or invent code that is not shown.
- Prefer concrete, minimal fixes (library + one-line approach).
- Output STRICT JSON only, matching this schema:
{
  "summary": "one or two sentence overall risk assessment",
  "additionalFindings": [
    { "file": "path", "attackType": "...", "severity": "critical|high|medium|low", "description": "...", "fix": "..." }
  ],
  "prioritizedFixes": ["step 1", "step 2", "..."]
}
Return at most 8 additionalFindings and at most 6 prioritizedFixes.`;

/**
 * Build a compact, budget-friendly context from findings + minimal code excerpts.
 * We send only the lines around each finding, not whole files, to keep token usage low.
 */
async function buildCompactContext(
  projectRoot: string,
  attackFindings: AttackFinding[],
  securityIssues: SecurityIssue[],
  maxExcerptLines: number,
): Promise<string> {
  const parts: string[] = [];

  parts.push('## Static findings (attack scanner)');
  for (const f of attackFindings.slice(0, 25)) {
    parts.push(`- [${f.severity}] ${f.attackType} @ ${f.file}:${f.line} — ${f.message}`);
  }

  parts.push('\n## Static findings (secret/misuse scanner)');
  for (const s of securityIssues.slice(0, 15)) {
    parts.push(`- [${s.severity}] ${s.category} @ ${s.file}:${s.line} — ${s.message}`);
  }

  // Gather small excerpts (±3 lines) around the most severe findings only
  const severeFiles = new Map<string, Set<number>>();
  for (const f of [...attackFindings].sort(severityRank).slice(0, 10)) {
    if (!severeFiles.has(f.file)) severeFiles.set(f.file, new Set());
    severeFiles.get(f.file)!.add(f.line);
  }

  parts.push('\n## Code excerpts (security-relevant only)');
  let excerptBudget = maxExcerptLines;
  for (const [file, lineSet] of severeFiles) {
    if (excerptBudget <= 0) break;
    try {
      const content = await readFile(resolve(projectRoot, file), 'utf-8');
      const lines = content.split('\n');
      parts.push(`\n### ${file}`);
      for (const ln of [...lineSet].sort((a, b) => a - b)) {
        const start = Math.max(0, ln - 3);
        const end = Math.min(lines.length, ln + 2);
        for (let i = start; i < end && excerptBudget > 0; i++) {
          parts.push(`${i + 1}: ${lines[i]}`);
          excerptBudget--;
        }
        parts.push('---');
      }
    } catch {
      // Skip unreadable file
    }
  }

  return parts.join('\n');
}

function severityRank(a: AttackFinding, b: AttackFinding): number {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
}

export async function runAIAdvisor(
  projectRoot: string,
  credentials: LLMCredentials,
  attackFindings: AttackFinding[],
  securityIssues: SecurityIssue[],
  opts: { maxExcerptLines?: number; maxTokens?: number } = {},
): Promise<AIAdvisorResult> {
  const maxExcerptLines = opts.maxExcerptLines ?? 120; // keep context small for budget
  const maxTokens = opts.maxTokens ?? 1500;

  const context = await buildCompactContext(projectRoot, attackFindings, securityIssues, maxExcerptLines);

  const messages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Audit this codebase summary and excerpts:\n\n${context}` },
  ];

  const client = new LLMClient(credentials);
  const response = await client.complete({ messages, maxTokens, temperature: 0.1 });

  // Parse JSON (tolerant of code fences)
  let parsed: {
    summary?: string;
    additionalFindings?: AIAdvisorResult['additionalFindings'];
    prioritizedFixes?: string[];
  };
  try {
    const jsonText = extractJson(response.content);
    parsed = JSON.parse(jsonText);
  } catch {
    // Fallback: wrap raw text as summary
    parsed = { summary: response.content.slice(0, 500), additionalFindings: [], prioritizedFixes: [] };
  }

  return {
    summary: parsed.summary ?? 'No summary returned.',
    additionalFindings: parsed.additionalFindings ?? [],
    prioritizedFixes: parsed.prioritizedFixes ?? [],
    tokensUsed: response.usage.totalTokens,
    model: response.model,
  };
}

function extractJson(text: string): string {
  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Otherwise find the first { ... last }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return text.slice(first, last + 1);
  }
  return text.trim();
}
