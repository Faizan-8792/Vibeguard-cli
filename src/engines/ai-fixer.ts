import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { LLMClient, type LLMMessage } from './llm-provider.js';
import type { LLMCredentials } from '../storage/credentials-store.js';
import type { AttackFinding } from './attack-scanner.js';
import type { SecurityIssue } from './security-scanner.js';

export interface FileFixPlan {
  file: string;
  issues: string[];
  originalContent: string;
  fixedContent: string;
  changed: boolean;
  explanation: string;
}

export interface AIFixResult {
  plans: FileFixPlan[];
  tokensUsed: number;
  model: string;
  applied: boolean;
  backupDir?: string;
}

const DEFAULT_MAX_FILES = 10;
const DEFAULT_MAX_TOKENS_PER_FILE = 4000;
/** Files larger than this (in chars) are skipped to keep LLM context budget-friendly. */
const MAX_FILE_SIZE_CHARS = 24000;
/** Only these extensions are auto-fixable; .env/.gitignore are handled by `security --fix`. */
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const FIX_SYSTEM_PROMPT = `You are CodeScout's senior security engineer performing automated remediation.

You receive ONE source file and a list of confirmed vulnerabilities found in it. Rewrite the file to fix EVERY listed vulnerability while preserving all existing functionality and code style.

Remediation guidelines:
- Hard-coded secrets -> replace literal with process.env.NAME (keep the variable, change the value source).
- SQL injection -> use parameterized queries / prepared statements.
- Command injection -> use execFile with an args array instead of string interpolation.
- Path traversal -> normalize and validate the path stays inside an allowed base directory.
- SSRF -> validate the URL against an allowlist before fetching.
- XSS -> sanitize with a comment noting DOMPurify, or use safe text APIs.
- eval/new Function -> replace with safe parsing or explicit logic.
- Weak crypto (md5/sha1) -> use sha256; passwords -> note bcrypt/argon2.
- Math.random for secrets -> use crypto.randomBytes/randomUUID.
- Missing rate limiting -> add a comment and minimal middleware wiring where obvious.
- Open redirect -> validate target against allowlist.
- CORS wildcard -> restrict origin.

Hard rules:
- Output STRICT JSON only: { "fixedContent": "<full file content>", "changed": true|false, "explanation": "one short paragraph" }
- "fixedContent" MUST be the COMPLETE file, not a diff or snippet.
- Do NOT add unrelated changes, do NOT remove functionality.
- If you genuinely cannot improve the file safely, set "changed": false and return the original content.
- Keep the same language, imports style, and formatting.`;

/**
 * Generate fixes for the files referenced by the findings.
 * Processes one file per LLM call to keep context small and budget-friendly.
 */
export async function generateFixes(
  projectRoot: string,
  credentials: LLMCredentials,
  attackFindings: AttackFinding[],
  securityIssues: SecurityIssue[],
  opts: { maxFiles?: number; maxTokensPerFile?: number } = {},
): Promise<FileFixPlan[]> {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const maxTokensPerFile = opts.maxTokensPerFile ?? DEFAULT_MAX_TOKENS_PER_FILE;

  const issuesByFile = groupIssuesByFile(attackFindings, securityIssues);
  const fixableFiles = [...issuesByFile.keys()]
    .filter((file) => SOURCE_FILE_PATTERN.test(file))
    .slice(0, maxFiles);

  const client = new LLMClient(credentials);
  const plans: FileFixPlan[] = [];

  for (const file of fixableFiles) {
    const plan = await planFileFix(client, projectRoot, file, issuesByFile.get(file)!, maxTokensPerFile);
    if (plan) plans.push(plan);
  }

  return plans;
}

/** Group attack findings and security issues into a per-file list of human-readable descriptions. */
function groupIssuesByFile(
  attackFindings: AttackFinding[],
  securityIssues: SecurityIssue[],
): Map<string, string[]> {
  const issuesByFile = new Map<string, string[]>();

  const add = (file: string, description: string): void => {
    const existing = issuesByFile.get(file);
    if (existing) existing.push(description);
    else issuesByFile.set(file, [description]);
  };

  for (const f of attackFindings) {
    add(f.file, `[${f.severity}] ${f.attackType} (line ${f.line}): ${f.message}. Fix: ${f.recommendation}`);
  }
  for (const s of securityIssues) {
    add(s.file, `[${s.severity}] ${s.category} (line ${s.line}): ${s.message}${s.suggestedFix ? '. Fix: ' + s.suggestedFix : ''}`);
  }

  return issuesByFile;
}

/**
 * Produce a fix plan for a single file via one LLM call.
 * Returns `null` when the file cannot be read (and should be skipped entirely).
 */
async function planFileFix(
  client: LLMClient,
  projectRoot: string,
  file: string,
  issues: string[],
  maxTokensPerFile: number,
): Promise<FileFixPlan | null> {
  let originalContent: string;
  try {
    originalContent = await readFile(resolve(projectRoot, file), 'utf-8');
  } catch {
    return null;
  }

  if (originalContent.length > MAX_FILE_SIZE_CHARS) {
    return {
      file,
      issues,
      originalContent,
      fixedContent: originalContent,
      changed: false,
      explanation: 'File too large for automated AI fix; review manually.',
    };
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: FIX_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `File: ${file}\n\nVulnerabilities:\n${issues.map((i) => '- ' + i).join('\n')}\n\nCurrent file content:\n\`\`\`\n${originalContent}\n\`\`\``,
    },
  ];

  try {
    const response = await client.complete({ messages, maxTokens: maxTokensPerFile, temperature: 0.1 });
    const parsed = parseFixResponse(response.content);
    const fixedContent = parsed.fixedContent || originalContent;
    return {
      file,
      issues,
      originalContent,
      fixedContent,
      changed: parsed.changed && parsed.fixedContent.trim().length > 0 && parsed.fixedContent !== originalContent,
      explanation: parsed.explanation || 'No explanation provided.',
    };
  } catch (err) {
    return {
      file,
      issues,
      originalContent,
      fixedContent: originalContent,
      changed: false,
      explanation: `AI fix failed: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}

/**
 * Apply fix plans to disk. Backs up originals to .codescout-trash/ai-fix-<timestamp>/ first.
 */
export async function applyFixes(
  projectRoot: string,
  plans: FileFixPlan[],
): Promise<{ applied: number; backupDir: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = join(projectRoot, '.codescout-trash', `ai-fix-${timestamp}`);

  let applied = 0;
  for (const plan of plans) {
    if (!plan.changed) continue;

    const absFile = resolve(projectRoot, plan.file);

    // Backup original
    const backupPath = join(backupDir, plan.file);
    await mkdir(dirname(backupPath), { recursive: true });
    await cp(absFile, backupPath);

    // Write fixed content
    await writeFile(absFile, plan.fixedContent, 'utf-8');
    applied++;
  }

  return { applied, backupDir };
}

function parseFixResponse(text: string): { fixedContent: string; changed: boolean; explanation: string } {
  let jsonText = text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonText = fence[1].trim();
  else {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) jsonText = text.slice(first, last + 1);
  }

  try {
    const obj = JSON.parse(jsonText) as { fixedContent?: string; changed?: boolean; explanation?: string };
    return {
      fixedContent: obj.fixedContent ?? '',
      changed: obj.changed ?? false,
      explanation: obj.explanation ?? '',
    };
  } catch {
    return { fixedContent: '', changed: false, explanation: 'Could not parse AI response.' };
  }
}
