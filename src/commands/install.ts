import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { statusIcon, brand, header } from '../utils/ui.js';
import { emitJson } from '../utils/json-output.js';
import { CodeScoutError, ErrorCodes } from '../utils/errors.js';
import type { CommandContext } from '../context.js';
import type { CavemanLevel } from '../engines/caveman.js';

const SKILL_CONTENT = `---
name: codescout
description: Local-only static analysis, security scanning, dead code detection, and AI context packaging. Trigger with /codescout.
---
# CodeScout Skill

Local-only TypeScript/JavaScript static analysis, security scanning, dead code detection, and AI context packaging.

## Trigger

When the user types \`/codescout\` followed by a command, execute the corresponding action.

## Commands

### \`/codescout scan\`
Run security scan on the current project. Detect hard-coded secrets, .env/.gitignore gaps, and framework misuse.

Execute: \`npx codescout-cli security --json\`

Parse the JSON output and present issues with severity, file, line, message, and suggested fix.

### \`/codescout health\`
Get project health score (0-100) with sub-scores.

Execute: \`npx codescout-cli doctor --json\`

### \`/codescout pack <task>\`
Generate an optimized context package for a specific task (80-95% token reduction).

Execute: \`npx codescout-cli pack "<task>" --json\`

After generating, read \`.codescout/context-package.md\` and use it as context.

### \`/codescout dead\`
Detect dead code: unused files, unused exports.

Execute: \`npx codescout-cli clean --plan --json\`

### \`/codescout map\`
Rebuild the dependency graph (run once after big code changes).

Execute: \`npx codescout-cli map --json\`

### \`/codescout context <task>\`
Generate context package and auto-include it in the conversation.

Execute:
1. \`npx codescout-cli pack "<task>" --json\`
2. Read \`.codescout/context-package.md\`
3. Use as context for subsequent responses

### \`/codescout fix\`
Auto-fix security issues.

Execute: \`npx codescout-cli security --fix=gitignore\`

### \`/codescout\`
Show available commands.

## Notes
- All commands are local-only, no network calls
- Results cached in \`.codescout/\` for incremental rebuilds
- Use \`pack\` before complex questions to reduce tokens by 80-95%
`;

const STEERING_CONTENT = `---
inclusion: auto
---
# CodeScout Guide — Always-On Context

> Auto-loaded guidance file. You do NOT pick this in the chat box. To run
> CodeScout, pick the **\`codescout\` skill** (or type \`/codescout <task>\`) —
> that builds the map and packs context automatically.

CodeScout is installed in this project. Type \`/codescout\` in chat to use it.

## Quick Commands
- \`/codescout scan\` — Security scan with fixes
- \`/codescout health\` — Project health score
- \`/codescout pack "task"\` — Optimized context (80-95% fewer tokens)
- \`/codescout context "task"\` — Generate and auto-include context
- \`/codescout dead\` — Dead code detection
- \`/codescout map\` — Rebuild the dependency graph (local, no tokens)
- \`/codescout fix\` — Auto-fix security issues

## When to Use
- Before architecture questions: \`/codescout pack "question"\`
- Before making changes: \`/codescout context "task"\`
- After changes: \`/codescout scan\`
- Periodically: \`/codescout health\`

#[[file:.codescout/context-package.md]]
`;

const SUPPORTED_PLATFORMS = ['kiro', 'cursor', 'claude', 'copilot', 'gemini', 'aider', 'vscode', 'codex', 'antigravity'] as const;
type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

function normalizePlatform(platform: string): SupportedPlatform {
  if ((SUPPORTED_PLATFORMS as readonly string[]).includes(platform)) {
    return platform as SupportedPlatform;
  }

  throw new CodeScoutError(
    ErrorCodes.UNKNOWN_OPTION,
    `Unknown install platform: "${platform}". Valid platforms: ${SUPPORTED_PLATFORMS.join(', ')}`,
    { platform, validPlatforms: [...SUPPORTED_PLATFORMS] },
  );
}

async function withSuppressedStdout<T>(enabled: boolean, fn: () => Promise<T>): Promise<T> {
  if (!enabled) return fn();

  const originalWrite = process.stdout.write;
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return await fn();
  } finally {
    process.stdout.write = originalWrite;
  }
}

/**
 * Write or merge a CodeScout MCP server entry into a platform's MCP config file.
 * Merges into any existing config so other MCP servers are preserved.
 * Uses `npx -y codescout-cli serve` so it works on any machine without absolute paths.
 */
async function writeMcpConfig(
  projectRoot: string,
  relativeConfigPath: string,
  serverKey: 'mcpServers' | 'servers' = 'mcpServers',
): Promise<{ action: string; path: string }> {
  const configPath = join(projectRoot, relativeConfigPath);
  await mkdir(dirname(configPath), { recursive: true });

  let config: Record<string, unknown> = {};
  let action = 'Created';
  try {
    const raw = await readFile(configPath, 'utf-8');
    config = JSON.parse(raw);
    action = 'Updated';
  } catch {
    // No existing config (or unreadable) — start fresh.
  }

  const existing = config[serverKey];
  const servers: Record<string, unknown> =
    existing && typeof existing === 'object' ? (existing as Record<string, unknown>) : {};

  servers['codescout'] = {
    command: 'npx',
    args: ['-y', 'codescout-cli', 'serve'],
    disabled: false,
    autoApprove: [
      'get_minimal_context',
      'query_graph',
      'explain_node',
      'get_affected',
      'find_path',
    ],
  };
  config[serverKey] = servers;

  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  return { action: `${action} MCP config`, path: relativeConfigPath.replace(/\\/g, '/') };
}

/**
 * Remove the CodeScout entry from a platform's MCP config, preserving any other
 * MCP servers and removing the file only when it becomes empty.
 */
async function removeMcpConfig(
  projectRoot: string,
  relativeConfigPath: string,
  serverKey: 'mcpServers' | 'servers' = 'mcpServers',
): Promise<{ removed: boolean; path: string }> {
  const normalizedPath = relativeConfigPath.replace(/\\/g, '/');
  const configPath = join(projectRoot, relativeConfigPath);

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(await readFile(configPath, 'utf-8'));
  } catch {
    return { removed: false, path: normalizedPath };
  }

  const servers = config[serverKey];
  if (!servers || typeof servers !== 'object' || !(servers as Record<string, unknown>)['codescout']) {
    return { removed: false, path: normalizedPath };
  }

  delete (servers as Record<string, unknown>)['codescout'];

  if (Object.keys(servers as Record<string, unknown>).length === 0) {
    const { rm } = await import('node:fs/promises');
    await rm(configPath);
  } else {
    config[serverKey] = servers;
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  return { removed: true, path: normalizedPath };
}

export async function runInstall(
  ctx: CommandContext,
  opts: { platform: string; caveman?: string | boolean; map?: boolean },
): Promise<void> {
  const { projectRoot } = ctx;
  const platform = normalizePlatform(opts.platform);
  const jsonMode = ctx.options.json;

  await withSuppressedStdout(jsonMode, async () => {
    switch (platform) {
      case 'kiro':
        await installKiro(projectRoot);
        break;
      case 'cursor':
        await installCursor(projectRoot);
        break;
      case 'claude':
        await installClaude(projectRoot);
        break;
      case 'copilot':
        await installCopilot(projectRoot);
        break;
      case 'gemini':
        await installGemini(projectRoot);
        break;
      case 'aider':
        await installAider(projectRoot);
        break;
      case 'vscode':
        await installVscode(projectRoot);
        break;
      case 'codex':
        await installCodex(projectRoot);
        break;
      case 'antigravity':
        await installAntigravity(projectRoot);
        break;
    }
  });

  // ── One-shot setup: from here, a single `install` leaves the project fully
  // ready — config initialized, Caveman Mode on, and the dependency graph
  // built — regardless of which IDE was targeted. Each step is non-fatal so a
  // failure in one (e.g. graph build on a huge repo) never blocks the others.

  // 1) Ensure `.codescout/config.json` exists (every platform, not just Kiro).
  const configCreated = await ensureCodeScoutConfig(projectRoot);
  if (configCreated && !jsonMode) {
    process.stdout.write(
      `  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.codescout/config.json')}\n`,
    );
  }

  // 2) Enable Caveman Mode by default (opt out with `--no-caveman`).
  let cavemanEnabled: { level: CavemanLevel; written: string[] } | null = null;
  if (opts.caveman !== false) {
    const { enableCaveman, isCavemanLevel, DEFAULT_CAVEMAN_LEVEL } = await import('../engines/caveman.js');
    const requested = typeof opts.caveman === 'string' ? opts.caveman : undefined;
    if (requested !== undefined && !isCavemanLevel(requested)) {
      throw new CodeScoutError(
        ErrorCodes.UNKNOWN_OPTION,
        `Unknown caveman level: "${requested}". Valid levels: lite, full, ultra`,
      );
    }
    const level = (requested ?? DEFAULT_CAVEMAN_LEVEL) as CavemanLevel;
    const { written } = await enableCaveman(projectRoot, level);
    cavemanEnabled = { level, written };
    if (!jsonMode) {
      process.stdout.write(
        `  ${statusIcon('success')} ${brand.success('Caveman Mode enabled')} ${brand.muted(`(level: ${level})`)}\n`,
      );
    }
  }

  // 3) Build the dependency graph so the agent has a map immediately (opt out
  //    with `--no-map`). Non-fatal: a build failure must not fail the install.
  let mapBuilt: { nodes: number; edges: number } | null = null;
  let mapError: string | null = null;
  if (opts.map !== false) {
    try {
      mapBuilt = await buildInstallGraph(ctx);
      if (mapBuilt && !jsonMode) {
        process.stdout.write(
          `  ${statusIcon('success')} ${brand.success('Dependency graph built')} ` +
            `${brand.muted(`(${mapBuilt.nodes} files, ${mapBuilt.edges} edges)`)}\n`,
        );
      }
    } catch (err) {
      mapError = err instanceof Error ? err.message : String(err);
      if (!jsonMode) {
        process.stdout.write(
          `  ${statusIcon('warning')} ${brand.muted(`Skipped graph build: ${mapError}. Run \`codescout map\` later.`)}\n`,
        );
      }
    }
  }

  if (!jsonMode) process.stdout.write('\n');

  if (jsonMode) {
    emitJson({
      action: 'install',
      platform,
      installed: true,
      configCreated,
      caveman: cavemanEnabled,
      map: mapBuilt,
      mapError,
    });
  }
}

/**
 * Ensure `.codescout/config.json` exists, creating it from defaults when absent.
 * Returns true when a new config was written, false when one already existed.
 * Shared by every platform so a single `install` always leaves a valid config.
 */
async function ensureCodeScoutConfig(projectRoot: string): Promise<boolean> {
  const configPath = join(projectRoot, '.codescout', 'config.json');
  try {
    await access(configPath);
    return false;
  } catch {
    // doesn't exist — create it.
  }

  const { runInit } = await import('./init.js');
  const { loadConfig } = await import('../storage/config-store.js');
  const { createLogger } = await import('../utils/logger.js');
  const config = await loadConfig(projectRoot);
  const logger = createLogger({ jsonMode: false, quiet: true, verbose: false, command: 'install' });
  const initCtx = {
    options: { json: false, cwd: projectRoot, include: [], exclude: [], config: undefined, verbose: false, quiet: true },
    config,
    logger,
    projectRoot,
  };
  await runInit(initCtx, { force: false });
  return true;
}

/**
 * Build (or incrementally refresh) the dependency graph as part of install, so
 * the agent has a usable map without a separate `codescout map` step. Reuses the
 * resolved config from the command context and runs quietly.
 */
async function buildInstallGraph(ctx: CommandContext): Promise<{ nodes: number; edges: number }> {
  const { projectRoot, config, logger } = ctx;
  const { resolveFiles } = await import('../utils/glob-resolver.js');
  const { buildGraph } = await import('../engines/graph-builder.js');
  const files = await resolveFiles(projectRoot, config.effectiveInclude, config.effectiveSkipSet);
  const result = await buildGraph(projectRoot, files, config, logger);
  return { nodes: result.summary.nodes, edges: result.summary.edges };
}

async function installKiro(projectRoot: string): Promise<void> {
  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout Install'));
  output.push('');

  // Create skill directory
  const skillDir = join(projectRoot, '.kiro', 'skills', 'codescout');
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), SKILL_CONTENT, 'utf-8');
  output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.kiro/skills/codescout/SKILL.md')}`);

  // Create steering file
  const steeringDir = join(projectRoot, '.kiro', 'steering');
  await mkdir(steeringDir, { recursive: true });
  await writeFile(join(steeringDir, 'codescout-guide.md'), STEERING_CONTENT, 'utf-8');
  output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.kiro/steering/codescout-guide.md')}`);

  // Write a real MCP server config so the agent gets live tools, not just instructions.
  const mcpResult = await writeMcpConfig(projectRoot, join('.kiro', 'settings', 'mcp.json'));
  output.push(`  ${statusIcon('success')} ${brand.success(mcpResult.action)} ${brand.muted(mcpResult.path)}`);

  // Init codescout config if not exists
  const configPath = join(projectRoot, '.codescout', 'config.json');
  let configExists = false;
  try {
    await access(configPath);
    configExists = true;
  } catch {
    // doesn't exist
  }

  if (!configExists) {
    const { runInit } = await import('./init.js');
    const { loadConfig } = await import('../storage/config-store.js');
    const { createLogger } = await import('../utils/logger.js');
    const config = await loadConfig(projectRoot);
    const logger = createLogger({ jsonMode: false, quiet: true, verbose: false, command: 'install' });
    const initCtx = { options: { json: false, cwd: projectRoot, include: [], exclude: [], config: undefined, verbose: false, quiet: true }, config, logger, projectRoot };
    await runInit(initCtx, { force: false });
    output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.codescout/config.json')}`);
  } else {
    output.push(`  ${statusIcon('info')} ${brand.muted('.codescout/config.json already exists')}`);
  }

  output.push('');
  output.push(`  ${brand.primary.bold('Done!')} CodeScout is now integrated with Kiro.`);
  output.push('');
  output.push(`  ${brand.secondary('Usage in chat:')}`);
  output.push(`    Type ${brand.info('/codescout scan')} to run a security scan`);
  output.push(`    Type ${brand.info('/codescout health')} for project health`);
  output.push(`    Type ${brand.info('/codescout pack "fix auth"')} for optimized context`);
  output.push('');

  process.stdout.write(output.join('\n') + '\n');
}

async function installCursor(projectRoot: string): Promise<void> {
  const rulesDir = join(projectRoot, '.cursor', 'rules');
  await mkdir(rulesDir, { recursive: true });

  // Cursor's rule parser expects all three frontmatter keys: description, globs,
  // and alwaysApply. Omitting `globs` causes Cursor to silently ignore the rule
  // (the reported "not working" bug). `globs: **/*` + `alwaysApply: true` makes
  // it a true always-on project rule across every file type.
  const cursorRule = `---
description: CodeScout — intelligent, graph-first context selection
globs: **/*
alwaysApply: true
---

# CodeScout Integration

When answering questions about this codebase:
1. Run \`npx codescout-cli pack "<user question>" --json\` to get optimized file selection
2. Read only the files listed in the result (5-15 most relevant files)
3. Never blindly read the entire project — use the dependency graph

Available commands:
- \`npx codescout-cli --scan\` — Security scan
- \`npx codescout-cli --health\` — Project health score
- \`npx codescout-cli attack\` — Cyberattack vulnerability scan
- \`npx codescout-cli graph\` — Generate interactive HTML graph
- \`npx codescout-cli pack "task"\` — Generate context package (80-95% token reduction)

The dependency graph is at \`.codescout/graph.json\`. Use it to understand file relationships before answering architecture questions.
`;

  await writeFile(join(rulesDir, 'codescout.mdc'), cursorRule, 'utf-8');

  // Cursor reads MCP servers from .cursor/mcp.json (mcpServers key) — give it
  // the live CodeScout tools, matching what the Kiro/VS Code installers do.
  const mcpResult = await writeMcpConfig(projectRoot, join('.cursor', 'mcp.json'));

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout — Cursor Install'));
  output.push('');
  output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.cursor/rules/codescout.mdc')}`);
  output.push(`  ${statusIcon('success')} ${brand.success(mcpResult.action)} ${brand.muted(mcpResult.path)}`);
  output.push('');
  output.push(`  ${brand.primary.bold('Done!')} CodeScout is now always-on in Cursor.`);
  output.push(`  ${brand.muted('Reload Cursor (or restart it) so it picks up the new rule + MCP server.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

async function installClaude(projectRoot: string): Promise<void> {
  const claudeSection = `
## CodeScout — Intelligent Context Selection

When working on this codebase:
1. Before answering questions, run: \`npx codescout-cli pack "<task>" --json\`
2. Read ONLY the files listed in the output (5-15 most relevant)
3. Use \`.codescout/graph.json\` to understand file relationships
4. Never read the entire project blindly — the graph tells you what's connected

Available tools:
- \`npx codescout-cli --scan\` — Find secrets & vulnerabilities
- \`npx codescout-cli --health\` — Project quality score (0-100)
- \`npx codescout-cli attack --ai --fix\` — AI-powered security fix
- \`npx codescout-cli graph\` — Generate interactive dependency graph
- \`npx codescout-cli pack "task"\` — Get optimized context (80-95% fewer tokens)
`;

  const claudePath = join(projectRoot, 'CLAUDE.md');
  let existingContent = '';
  try {
    existingContent = await readFile(claudePath, 'utf-8');
  } catch {
    // doesn't exist
  }

  if (existingContent.includes('CodeScout')) {
    process.stdout.write(`\n  ${statusIcon('info')} ${brand.muted('CLAUDE.md already contains CodeScout section.')}\n\n`);
    return;
  }

  const newContent = existingContent + '\n' + claudeSection;
  await writeFile(claudePath, newContent, 'utf-8');

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout — Claude Code Install'));
  output.push('');
  output.push(`  ${statusIcon('success')} ${brand.success('Added CodeScout section to')} ${brand.muted('CLAUDE.md')}`);
  output.push('');
  output.push(`  ${brand.primary.bold('Done!')} Claude Code will now use the dependency graph automatically.`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

async function installCopilot(projectRoot: string): Promise<void> {
  const instructionsDir = join(projectRoot, '.github');
  await mkdir(instructionsDir, { recursive: true });

  const copilotInstructions = `# CodeScout — GitHub Copilot Integration

When working on this codebase, use CodeScout for intelligent context selection and security scanning.

## Context Selection
Before answering questions about architecture or making multi-file changes:
1. Run \`npx codescout-cli pack "<task>" --json\` to get the optimal file set
2. Read ONLY the files listed in the output (5-15 most relevant files)
3. Use \`.codescout/graph.json\` to understand file relationships
4. Never read the entire project blindly — the graph tells you what's connected

## Available Commands
- \`npx codescout-cli --scan\` — Find secrets & security vulnerabilities
- \`npx codescout-cli --health\` — Project quality score (0-100)
- \`npx codescout-cli --dead\` — Detect unused code
- \`npx codescout-cli attack\` — Cyberattack vulnerability scan
- \`npx codescout-cli attack --ai --fix\` — AI-powered security fix
- \`npx codescout-cli graph\` — Generate interactive HTML dependency graph
- \`npx codescout-cli pack "task"\` — Get optimized context (80-95% fewer tokens)

## Workflow
- Before architecture questions: run \`pack\` first
- Before making changes: run \`pack\` to understand dependencies
- After changes: run \`--scan\` to check for security issues
- Periodically: run \`--health\` to track project quality

## Key Files
- \`.codescout/graph.json\` — Dependency graph data
- \`.codescout/context-package.md\` — Latest context package
- \`.codescout/config.json\` — CodeScout configuration
`;

  await writeFile(join(instructionsDir, 'copilot-instructions.md'), copilotInstructions, 'utf-8');

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout — GitHub Copilot Install'));
  output.push('');
  output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.github/copilot-instructions.md')}`);
  output.push('');
  output.push(`  ${brand.primary.bold('Done!')} CodeScout is now integrated with GitHub Copilot.`);
  output.push(`  ${brand.muted('Copilot will use the dependency graph for intelligent context selection.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

async function installGemini(projectRoot: string): Promise<void> {
  const geminiContent = `# CodeScout — Gemini Integration

When working on this codebase, use CodeScout for intelligent context selection and security scanning.

## Context Selection
Before answering questions about architecture or making multi-file changes:
1. Run \`npx codescout-cli pack "<task>" --json\` to get the optimal file set
2. Read ONLY the files listed in the output (5-15 most relevant files)
3. Use \`.codescout/graph.json\` to understand file relationships
4. Never read the entire project blindly — the graph tells you what's connected

## Available Commands
- \`npx codescout-cli --scan\` — Find secrets & security vulnerabilities
- \`npx codescout-cli --health\` — Project quality score (0-100)
- \`npx codescout-cli --dead\` — Detect unused code
- \`npx codescout-cli attack\` — Cyberattack vulnerability scan
- \`npx codescout-cli attack --ai --fix\` — AI-powered security fix
- \`npx codescout-cli graph\` — Generate interactive HTML dependency graph
- \`npx codescout-cli pack "task"\` — Get optimized context (80-95% fewer tokens)

## Workflow
- Before architecture questions: run \`pack\` first
- Before making changes: run \`pack\` to understand dependencies
- After changes: run \`--scan\` to check for security issues
- Periodically: run \`--health\` to track project quality

## Key Files
- \`.codescout/graph.json\` — Dependency graph data
- \`.codescout/context-package.md\` — Latest context package
- \`.codescout/config.json\` — CodeScout configuration
`;

  const geminiDir = join(projectRoot, '.gemini');
  await mkdir(geminiDir, { recursive: true });
  await writeFile(join(geminiDir, 'CONTEXT.md'), geminiContent, 'utf-8');

  // Also write a settings file for Gemini CLI/IDE integration
  const settingsPath = join(geminiDir, 'settings.json');
  let existingSettings: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, 'utf-8');
    existingSettings = JSON.parse(raw);
  } catch {
    // doesn't exist
  }

  existingSettings['codescout'] = {
    enabled: true,
    contextFile: '.codescout/context-package.md',
    graphFile: '.codescout/graph.json',
  };

  await writeFile(settingsPath, JSON.stringify(existingSettings, null, 2), 'utf-8');

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout — Gemini Install'));
  output.push('');
  output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.gemini/CONTEXT.md')}`);
  output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.gemini/settings.json')}`);
  output.push('');
  output.push(`  ${brand.primary.bold('Done!')} CodeScout is now integrated with Gemini.`);
  output.push(`  ${brand.muted('Gemini will use the dependency graph for intelligent context selection.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

async function installAider(projectRoot: string): Promise<void> {
  const aiderContent = `# CodeScout — Project Intelligence

This project uses CodeScout for static analysis, security scanning, and intelligent context selection.

## Quick Reference

### Get Optimized Context (80-95% fewer tokens)
\`\`\`bash
npx codescout-cli pack "your task description"
\`\`\`
Then read \`.codescout/context-package.md\` for the focused file set.

### Security Scan
\`\`\`bash
npx codescout-cli --scan
\`\`\`

### Project Health Score
\`\`\`bash
npx codescout-cli --health
\`\`\`

### Dependency Graph
\`\`\`bash
npx codescout-cli --graph
\`\`\`

### Dead Code Detection
\`\`\`bash
npx codescout-cli --dead
\`\`\`

### Cyberattack Scan with AI Fix
\`\`\`bash
npx codescout-cli attack --ai --fix
\`\`\`

## Key Conventions
- The dependency graph is at \`.codescout/graph.json\`
- Context packages are at \`.codescout/context-package.md\`
- Always run \`pack\` before working on multi-file tasks
- Use the graph to understand which files are connected before making changes
`;

  const aiderConventions = `# .aider.conf.yml conventions
# CodeScout integration: use context packages for efficient token usage

read:
  - .codescout/context-package.md
  - .codescout/graph.json
`;

  await writeFile(join(projectRoot, '.aider.context.md'), aiderContent, 'utf-8');

  // Write .aider.conf.yml if it doesn't exist
  const confPath = join(projectRoot, '.aider.conf.yml');
  let confExists = false;
  try {
    await access(confPath);
    confExists = true;
  } catch {
    // doesn't exist
  }

  if (!confExists) {
    await writeFile(confPath, aiderConventions, 'utf-8');
  }

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout — Aider Install'));
  output.push('');
  output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.aider.context.md')}`);
  if (!confExists) {
    output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.aider.conf.yml')}`);
  } else {
    output.push(`  ${statusIcon('info')} ${brand.muted('.aider.conf.yml already exists (preserved)')}`);
  }
  output.push('');
  output.push(`  ${brand.primary.bold('Done!')} CodeScout is now integrated with Aider.`);
  output.push(`  ${brand.muted('Use /read .codescout/context-package.md in Aider for optimized context.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

// ─── VS Code (native Copilot Chat / MCP) ─────────────────────────────────────
async function installVscode(projectRoot: string): Promise<void> {
  const instructionsDir = join(projectRoot, '.github');
  await mkdir(instructionsDir, { recursive: true });

  const instructions = `# CodeScout — VS Code Integration

VS Code's built-in Copilot Chat reads \`.github/copilot-instructions.md\`. When working
on this codebase, use CodeScout for intelligent context selection and security scanning.

## Context Selection
1. Run \`npx codescout-cli pack "<task>" --json\` to get the optimal file set
2. Read ONLY the files listed (5-15 most relevant) — never read the whole project
3. Use \`.codescout/graph.json\` to understand file relationships

## Available Commands
- \`npx codescout-cli --scan\` — secrets & security vulnerabilities
- \`npx codescout-cli --health\` — project quality score (0-100)
- \`npx codescout-cli attack\` — cyberattack vulnerability scan
- \`npx codescout-cli audit\` — unified security audit (deps, taint, misconfig, secrets, attacks)
- \`npx codescout-cli graph\` — interactive HTML dependency graph
- \`npx codescout-cli pack "task"\` — optimized context (80-95% fewer tokens)

## Live MCP Tools
This project also configures a CodeScout MCP server in \`.vscode/mcp.json\`, exposing
\`pack_context\`, \`query_graph\`, \`scan_security\`, \`run_audit\`, and more directly to the agent.
`;

  await writeFile(join(instructionsDir, 'copilot-instructions.md'), instructions, 'utf-8');

  // VS Code MCP config uses the "servers" key (not "mcpServers").
  const mcpResult = await writeMcpConfig(projectRoot, join('.vscode', 'mcp.json'), 'servers');

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout — VS Code Install'));
  output.push('');
  output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.github/copilot-instructions.md')}`);
  output.push(`  ${statusIcon('success')} ${brand.success(mcpResult.action)} ${brand.muted(mcpResult.path)}`);
  output.push('');
  output.push(`  ${brand.primary.bold('Done!')} CodeScout is now integrated with VS Code.`);
  output.push(`  ${brand.muted('Copilot Chat uses the instructions; the MCP server gives live graph/security tools.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

// ─── Codex / universal AGENTS.md agents ──────────────────────────────────────
async function installCodex(projectRoot: string): Promise<void> {
  const agentsPath = join(projectRoot, 'AGENTS.md');
  const section = `## CodeScout — Intelligent Context & Security

When working on this codebase, use CodeScout (a local CLI) for context selection and security.

- Before multi-file changes or architecture questions: \`npx codescout-cli pack "<task>" --json\`,
  then read ONLY the 5-15 listed files. Never read the whole project blindly.
- Security: \`npx codescout-cli audit --json\` (deps, taint, misconfig, secrets, attacks → 0-100 score),
  \`npx codescout-cli attack --json\`, \`npx codescout-cli --scan\`.
- Graph Q&A (zero tokens): \`npx codescout-cli query "<question>" --json\`, \`explain\`, \`affected\`.
- Key files: \`.codescout/graph.json\`, \`.codescout/context-package.md\`.
`;

  let existing = '';
  try {
    existing = await readFile(agentsPath, 'utf-8');
  } catch {
    // No AGENTS.md yet — create one.
  }

  let action: string;
  if (existing.includes('## CodeScout')) {
    action = 'AGENTS.md already contains a CodeScout section';
  } else if (existing.trim().length > 0) {
    await writeFile(agentsPath, existing.trimEnd() + '\n\n' + section, 'utf-8');
    action = 'Added CodeScout section to AGENTS.md';
  } else {
    await writeFile(agentsPath, `# Agent Instructions\n\n${section}`, 'utf-8');
    action = 'Created AGENTS.md';
  }

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout — Codex / AGENTS.md Install'));
  output.push('');
  output.push(`  ${statusIcon('success')} ${brand.success(action)}`);
  output.push('');
  output.push(`  ${brand.primary.bold('Done!')} CodeScout is now described in AGENTS.md.`);
  output.push(`  ${brand.muted('Codex, Jules, Amp and other AGENTS.md-aware agents will pick this up.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

// ─── Google Antigravity IDE (AGENTS.md + MCP) ────────────────────────────────
async function installAntigravity(projectRoot: string): Promise<void> {
  // Antigravity reads AGENTS.md (project root) for rules — reuse the same
  // create-or-fold section used for Codex, then add a project MCP config.
  const agentsPath = join(projectRoot, 'AGENTS.md');
  const section = `## CodeScout — Intelligent Context & Security

When working on this codebase, use CodeScout (a local CLI) for context selection and security.

- Before multi-file changes or architecture questions: \`npx codescout-cli pack "<task>" --json\`,
  then read ONLY the 5-15 listed files. Never read the whole project blindly.
- Security: \`npx codescout-cli audit --json\` (deps, taint, misconfig, secrets, attacks → 0-100 score),
  \`npx codescout-cli attack --json\`, \`npx codescout-cli --scan\`.
- Graph Q&A (zero tokens): \`npx codescout-cli query "<question>" --json\`, \`explain\`, \`affected\`.
- Live MCP tools are configured in \`.antigravity/mcp.json\`.
`;

  let existing = '';
  try {
    existing = await readFile(agentsPath, 'utf-8');
  } catch {
    // No AGENTS.md yet.
  }

  let agentsAction: string;
  if (existing.includes('## CodeScout')) {
    agentsAction = 'AGENTS.md already contains a CodeScout section';
  } else if (existing.trim().length > 0) {
    await writeFile(agentsPath, existing.trimEnd() + '\n\n' + section, 'utf-8');
    agentsAction = 'Added CodeScout section to AGENTS.md';
  } else {
    await writeFile(agentsPath, `# Agent Instructions\n\n${section}`, 'utf-8');
    agentsAction = 'Created AGENTS.md';
  }

  const mcpResult = await writeMcpConfig(projectRoot, join('.antigravity', 'mcp.json'));

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout — Antigravity Install'));
  output.push('');
  output.push(`  ${statusIcon('success')} ${brand.success(agentsAction)}`);
  output.push(`  ${statusIcon('success')} ${brand.success(mcpResult.action)} ${brand.muted(mcpResult.path)}`);
  output.push('');
  output.push(`  ${brand.primary.bold('Done!')} CodeScout is now integrated with Google Antigravity.`);
  output.push(`  ${brand.muted('AGENTS.md gives rules; the MCP server gives live graph/security tools.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

export async function runUninstall(ctx: CommandContext, opts: { platform: string }): Promise<void> {
  const { projectRoot } = ctx;
  const platform = normalizePlatform(opts.platform);

  await withSuppressedStdout(ctx.options.json, async () => {
    switch (platform) {
      case 'kiro':
        await uninstallKiro(projectRoot);
        break;
      case 'cursor':
        await uninstallCursor(projectRoot);
        break;
      case 'claude':
        await uninstallClaude(projectRoot);
        break;
      case 'copilot':
        await uninstallCopilot(projectRoot);
        break;
      case 'gemini':
        await uninstallGemini(projectRoot);
        break;
      case 'aider':
        await uninstallAider(projectRoot);
        break;
      case 'vscode':
        await uninstallVscode(projectRoot);
        break;
      case 'codex':
        await uninstallCodex(projectRoot);
        break;
      case 'antigravity':
        await uninstallAntigravity(projectRoot);
        break;
    }
  });

  // Also tear down Caveman rule files so uninstall leaves nothing behind.
  const { removeCavemanRules, loadCavemanState, saveCavemanState, CAVEMAN_SCHEMA_VERSION } =
    await import('../engines/caveman.js');
  const removedCaveman = await removeCavemanRules(projectRoot);
  if (removedCaveman.length > 0) {
    const prev = await loadCavemanState(projectRoot);
    await saveCavemanState(projectRoot, {
      schemaVersion: CAVEMAN_SCHEMA_VERSION,
      enabled: false,
      level: prev.level,
      updatedAt: new Date().toISOString(),
    });
    if (!ctx.options.json) {
      process.stdout.write(`  ${statusIcon('success')} ${brand.success('Removed Caveman rules')}\n\n`);
    }
  }

  // Also tear down GraphMode rule files so uninstall leaves nothing behind.
  const { removeGraphModeRules, saveGraphModeState, GRAPHMODE_SCHEMA_VERSION } =
    await import('../engines/graphmode.js');
  const removedGraphMode = await removeGraphModeRules(projectRoot);
  if (removedGraphMode.length > 0) {
    await saveGraphModeState(projectRoot, {
      schemaVersion: GRAPHMODE_SCHEMA_VERSION,
      enabled: false,
      updatedAt: new Date().toISOString(),
    });
    if (!ctx.options.json) {
      process.stdout.write(`  ${statusIcon('success')} ${brand.success('Removed GraphMode rules')}\n\n`);
    }
  }

  if (ctx.options.json) {
    emitJson({ action: 'uninstall', platform, uninstalled: true, cavemanRemoved: removedCaveman, graphModeRemoved: removedGraphMode });
  }
}

async function uninstallKiro(projectRoot: string): Promise<void> {
  const { rm } = await import('node:fs/promises');

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout Uninstall — Kiro'));
  output.push('');

  try {
    await rm(join(projectRoot, '.kiro', 'skills', 'codescout'), { recursive: true });
    output.push(`  ${statusIcon('success')} ${brand.success('Removed')} ${brand.muted('.kiro/skills/codescout/')}`);
  } catch {
    output.push(`  ${statusIcon('info')} ${brand.muted('Skill not found (already removed)')}`);
  }

  try {
    await rm(join(projectRoot, '.kiro', 'steering', 'codescout-guide.md'));
    output.push(`  ${statusIcon('success')} ${brand.success('Removed')} ${brand.muted('.kiro/steering/codescout-guide.md')}`);
  } catch {
    output.push(`  ${statusIcon('info')} ${brand.muted('Steering file not found (already removed)')}`);
  }

  // Legacy: earlier versions wrote the steering file as codescout.md.
  try {
    await rm(join(projectRoot, '.kiro', 'steering', 'codescout.md'));
    output.push(`  ${statusIcon('success')} ${brand.success('Removed')} ${brand.muted('.kiro/steering/codescout.md (legacy)')}`);
  } catch {
    // No legacy file — fine.
  }

  const mcpResult = await removeMcpConfig(projectRoot, join('.kiro', 'settings', 'mcp.json'));
  if (mcpResult.removed) {
    output.push(`  ${statusIcon('success')} ${brand.success('Removed codescout server from')} ${brand.muted(mcpResult.path)}`);
  } else {
    output.push(`  ${statusIcon('info')} ${brand.muted('No codescout MCP entry found (already removed)')}`);
  }

  output.push('');
  output.push(`  ${brand.muted('CodeScout uninstalled from Kiro. .codescout/ data preserved.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

async function uninstallCursor(projectRoot: string): Promise<void> {
  const { rm } = await import('node:fs/promises');

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout Uninstall — Cursor'));
  output.push('');

  try {
    await rm(join(projectRoot, '.cursor', 'rules', 'codescout.mdc'));
    output.push(`  ${statusIcon('success')} ${brand.success('Removed')} ${brand.muted('.cursor/rules/codescout.mdc')}`);
  } catch {
    output.push(`  ${statusIcon('info')} ${brand.muted('Cursor rule not found (already removed)')}`);
  }

  const mcpResult = await removeMcpConfig(projectRoot, join('.cursor', 'mcp.json'));
  if (mcpResult.removed) {
    output.push(`  ${statusIcon('success')} ${brand.success('Removed codescout server from')} ${brand.muted(mcpResult.path)}`);
  } else {
    output.push(`  ${statusIcon('info')} ${brand.muted('No codescout MCP entry found (already removed)')}`);
  }

  output.push('');
  output.push(`  ${brand.muted('CodeScout uninstalled from Cursor. .codescout/ data preserved.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

async function uninstallClaude(projectRoot: string): Promise<void> {
  const claudePath = join(projectRoot, 'CLAUDE.md');
  let content = '';
  try {
    content = await readFile(claudePath, 'utf-8');
  } catch {
    process.stdout.write(`\n  ${statusIcon('info')} ${brand.muted('CLAUDE.md not found (nothing to remove)')}\n\n`);
    return;
  }

  const sectionStart = content.indexOf('## CodeScout');
  if (sectionStart === -1) {
    process.stdout.write(`\n  ${statusIcon('info')} ${brand.muted('No CodeScout section found in CLAUDE.md')}\n\n`);
    return;
  }

  // Remove everything from the CodeScout section header to the next ## or end of file
  const afterSection = content.slice(sectionStart + 1);
  const nextHeading = afterSection.indexOf('\n## ');
  const cleaned = nextHeading === -1
    ? content.slice(0, sectionStart).trimEnd() + '\n'
    : content.slice(0, sectionStart) + afterSection.slice(nextHeading + 1);

  await writeFile(claudePath, cleaned, 'utf-8');

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout Uninstall — Claude Code'));
  output.push('');
  output.push(`  ${statusIcon('success')} ${brand.success('Removed CodeScout section from')} ${brand.muted('CLAUDE.md')}`);
  output.push('');
  output.push(`  ${brand.muted('CodeScout uninstalled from Claude Code. .codescout/ data preserved.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

async function uninstallCopilot(projectRoot: string): Promise<void> {
  const { rm } = await import('node:fs/promises');

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout Uninstall — GitHub Copilot'));
  output.push('');

  try {
    await rm(join(projectRoot, '.github', 'copilot-instructions.md'));
    output.push(`  ${statusIcon('success')} ${brand.success('Removed')} ${brand.muted('.github/copilot-instructions.md')}`);
  } catch {
    output.push(`  ${statusIcon('info')} ${brand.muted('Copilot instructions not found (already removed)')}`);
  }

  output.push('');
  output.push(`  ${brand.muted('CodeScout uninstalled from GitHub Copilot. .codescout/ data preserved.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

async function uninstallGemini(projectRoot: string): Promise<void> {
  const { rm } = await import('node:fs/promises');

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout Uninstall — Gemini'));
  output.push('');

  try {
    await rm(join(projectRoot, '.gemini', 'CONTEXT.md'));
    output.push(`  ${statusIcon('success')} ${brand.success('Removed')} ${brand.muted('.gemini/CONTEXT.md')}`);
  } catch {
    output.push(`  ${statusIcon('info')} ${brand.muted('Gemini context not found (already removed)')}`);
  }

  // Remove codescout key from settings.json if it exists
  const settingsPath = join(projectRoot, '.gemini', 'settings.json');
  try {
    const raw = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(raw);
    if (settings['codescout']) {
      delete settings['codescout'];
      await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      output.push(`  ${statusIcon('success')} ${brand.success('Removed codescout key from')} ${brand.muted('.gemini/settings.json')}`);
    }
  } catch {
    // settings.json doesn't exist or can't be parsed
  }

  output.push('');
  output.push(`  ${brand.muted('CodeScout uninstalled from Gemini. .codescout/ data preserved.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

async function uninstallAider(projectRoot: string): Promise<void> {
  const { rm } = await import('node:fs/promises');

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout Uninstall — Aider'));
  output.push('');

  try {
    await rm(join(projectRoot, '.aider.context.md'));
    output.push(`  ${statusIcon('success')} ${brand.success('Removed')} ${brand.muted('.aider.context.md')}`);
  } catch {
    output.push(`  ${statusIcon('info')} ${brand.muted('.aider.context.md not found (already removed)')}`);
  }

  output.push('');
  output.push(`  ${brand.muted('CodeScout uninstalled from Aider. .codescout/ data preserved.')}`);
  output.push(`  ${brand.muted('Note: .aider.conf.yml was preserved (may contain user config).')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

async function uninstallVscode(projectRoot: string): Promise<void> {
  const { rm } = await import('node:fs/promises');

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout Uninstall — VS Code'));
  output.push('');

  try {
    await rm(join(projectRoot, '.github', 'copilot-instructions.md'));
    output.push(`  ${statusIcon('success')} ${brand.success('Removed')} ${brand.muted('.github/copilot-instructions.md')}`);
  } catch {
    output.push(`  ${statusIcon('info')} ${brand.muted('Copilot instructions not found (already removed)')}`);
  }

  const mcpResult = await removeMcpConfig(projectRoot, join('.vscode', 'mcp.json'), 'servers');
  if (mcpResult.removed) {
    output.push(`  ${statusIcon('success')} ${brand.success('Removed codescout server from')} ${brand.muted(mcpResult.path)}`);
  } else {
    output.push(`  ${statusIcon('info')} ${brand.muted('No codescout MCP entry found (already removed)')}`);
  }

  output.push('');
  output.push(`  ${brand.muted('CodeScout uninstalled from VS Code. .codescout/ data preserved.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

async function uninstallCodex(projectRoot: string): Promise<void> {
  const agentsPath = join(projectRoot, 'AGENTS.md');

  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout Uninstall — Codex / AGENTS.md'));
  output.push('');

  let content = '';
  try {
    content = await readFile(agentsPath, 'utf-8');
  } catch {
    output.push(`  ${statusIcon('info')} ${brand.muted('AGENTS.md not found (nothing to remove)')}`);
    output.push('');
    process.stdout.write(output.join('\n') + '\n');
    return;
  }

  const sectionStart = content.indexOf('## CodeScout');
  if (sectionStart === -1) {
    output.push(`  ${statusIcon('info')} ${brand.muted('No CodeScout section found in AGENTS.md')}`);
  } else {
    const afterSection = content.slice(sectionStart + 1);
    const nextHeading = afterSection.indexOf('\n## ');
    const cleaned = nextHeading === -1
      ? content.slice(0, sectionStart).trimEnd() + '\n'
      : content.slice(0, sectionStart) + afterSection.slice(nextHeading + 1);
    await writeFile(agentsPath, cleaned, 'utf-8');
    output.push(`  ${statusIcon('success')} ${brand.success('Removed CodeScout section from')} ${brand.muted('AGENTS.md')}`);
  }

  output.push('');
  output.push(`  ${brand.muted('CodeScout uninstalled from Codex/AGENTS.md. .codescout/ data preserved.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}

async function uninstallAntigravity(projectRoot: string): Promise<void> {
  const output: string[] = [];
  output.push('');
  output.push(header('CodeScout Uninstall — Antigravity'));
  output.push('');

  // Strip our section from AGENTS.md (remove the file if it held only that).
  const agentsPath = join(projectRoot, 'AGENTS.md');
  try {
    const content = await readFile(agentsPath, 'utf-8');
    const sectionStart = content.indexOf('## CodeScout');
    if (sectionStart === -1) {
      output.push(`  ${statusIcon('info')} ${brand.muted('No CodeScout section found in AGENTS.md')}`);
    } else {
      const afterSection = content.slice(sectionStart + 1);
      const nextHeading = afterSection.indexOf('\n## ');
      const cleaned = nextHeading === -1
        ? content.slice(0, sectionStart).trimEnd() + '\n'
        : content.slice(0, sectionStart) + afterSection.slice(nextHeading + 1);
      await writeFile(agentsPath, cleaned, 'utf-8');
      output.push(`  ${statusIcon('success')} ${brand.success('Removed CodeScout section from')} ${brand.muted('AGENTS.md')}`);
    }
  } catch {
    output.push(`  ${statusIcon('info')} ${brand.muted('AGENTS.md not found (nothing to remove)')}`);
  }

  const mcpResult = await removeMcpConfig(projectRoot, join('.antigravity', 'mcp.json'));
  if (mcpResult.removed) {
    output.push(`  ${statusIcon('success')} ${brand.success('Removed codescout server from')} ${brand.muted(mcpResult.path)}`);
  } else {
    output.push(`  ${statusIcon('info')} ${brand.muted('No codescout MCP entry found (already removed)')}`);
  }

  output.push('');
  output.push(`  ${brand.muted('CodeScout uninstalled from Antigravity. .codescout/ data preserved.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}
