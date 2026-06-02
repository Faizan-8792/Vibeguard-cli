import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { statusIcon, brand, header } from '../utils/ui.js';
const SKILL_CONTENT = `# VibeGuard Skill

Local-only TypeScript/JavaScript static analysis, security scanning, dead code detection, and AI context packaging.

## Trigger

When the user types \`/vibeguard\` followed by a command, execute the corresponding action.

## Commands

### \`/vibeguard scan\`
Run security scan on the current project. Detect hard-coded secrets, .env/.gitignore gaps, and framework misuse.

Execute: \`npx vibeguard security --json\`

Parse the JSON output and present issues with severity, file, line, message, and suggested fix.

### \`/vibeguard health\`
Get project health score (0-100) with sub-scores.

Execute: \`npx vibeguard doctor --json\`

### \`/vibeguard pack <task>\`
Generate an optimized context package for a specific task (80-95% token reduction).

Execute: \`npx vibeguard pack "<task>" --json\`

After generating, read \`.vibeguard/context-package.md\` and use it as context.

### \`/vibeguard dead\`
Detect dead code: unused files, unused exports.

Execute: \`npx vibeguard clean --plan --json\`

### \`/vibeguard map\`
Build the dependency graph.

Execute: \`npx vibeguard map --json\`

### \`/vibeguard context <task>\`
Generate context package and auto-include it in the conversation.

Execute:
1. \`npx vibeguard pack "<task>" --json\`
2. Read \`.vibeguard/context-package.md\`
3. Use as context for subsequent responses

### \`/vibeguard fix\`
Auto-fix security issues.

Execute: \`npx vibeguard security --fix=gitignore\`

### \`/vibeguard\`
Show available commands.

## Notes
- All commands are local-only, no network calls
- Results cached in \`.vibeguard/\` for incremental rebuilds
- Use \`pack\` before complex questions to reduce tokens by 80-95%
`;
const STEERING_CONTENT = `---
inclusion: auto
---
# VibeGuard — Always-On Context

VibeGuard is installed in this project. Type \`/vibeguard\` in chat to use it.

## Quick Commands
- \`/vibeguard scan\` — Security scan with fixes
- \`/vibeguard health\` — Project health score
- \`/vibeguard pack "task"\` — Optimized context (80-95% fewer tokens)
- \`/vibeguard context "task"\` — Generate and auto-include context
- \`/vibeguard dead\` — Dead code detection
- \`/vibeguard map\` — Dependency graph
- \`/vibeguard fix\` — Auto-fix security issues

## When to Use
- Before architecture questions: \`/vibeguard pack "question"\`
- Before making changes: \`/vibeguard context "task"\`
- After changes: \`/vibeguard scan\`
- Periodically: \`/vibeguard health\`

#[[file:.vibeguard/context-package.md]]
`;
export async function runInstall(ctx, opts) {
    const { projectRoot } = ctx;
    switch (opts.platform) {
        case 'kiro':
            await installKiro(projectRoot);
            break;
        case 'cursor':
            await installCursor(projectRoot);
            break;
        case 'claude':
            await installClaude(projectRoot);
            break;
        default:
            await installKiro(projectRoot);
            break;
    }
}
async function installKiro(projectRoot) {
    const output = [];
    output.push('');
    output.push(header('VibeGuard Install', '⚡'));
    output.push('');
    // Create skill directory
    const skillDir = join(projectRoot, '.kiro', 'skills', 'vibeguard');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), SKILL_CONTENT, 'utf-8');
    output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.kiro/skills/vibeguard/SKILL.md')}`);
    // Create steering file
    const steeringDir = join(projectRoot, '.kiro', 'steering');
    await mkdir(steeringDir, { recursive: true });
    await writeFile(join(steeringDir, 'vibeguard.md'), STEERING_CONTENT, 'utf-8');
    output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.kiro/steering/vibeguard.md')}`);
    // Init vibeguard config if not exists
    const configPath = join(projectRoot, '.vibeguard', 'config.json');
    let configExists = false;
    try {
        await access(configPath);
        configExists = true;
    }
    catch {
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
        output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.vibeguard/config.json')}`);
    }
    else {
        output.push(`  ${statusIcon('info')} ${brand.muted('.vibeguard/config.json already exists')}`);
    }
    output.push('');
    output.push(`  ${brand.primary.bold('Done!')} VibeGuard is now integrated with Kiro.`);
    output.push('');
    output.push(`  ${brand.secondary('Usage in chat:')}`);
    output.push(`    Type ${brand.info('/vibeguard scan')} to run a security scan`);
    output.push(`    Type ${brand.info('/vibeguard health')} for project health`);
    output.push(`    Type ${brand.info('/vibeguard pack "fix auth"')} for optimized context`);
    output.push('');
    process.stdout.write(output.join('\n') + '\n');
}
async function installCursor(projectRoot) {
    const rulesDir = join(projectRoot, '.cursor', 'rules');
    await mkdir(rulesDir, { recursive: true });
    const cursorRule = `---
description: VibeGuard — intelligent context selection for code understanding
alwaysApply: true
---

# VibeGuard Integration

When answering questions about this codebase:
1. Run \`npx vibeguard pack "<user question>" --json\` to get optimized file selection
2. Read only the files listed in the result (5-15 most relevant files)
3. Never blindly read the entire project — use the dependency graph

Available commands:
- \`npx vibeguard --scan\` — Security scan
- \`npx vibeguard --health\` — Project health score
- \`npx vibeguard attack\` — Cyberattack vulnerability scan
- \`npx vibeguard graph\` — Generate interactive HTML graph
- \`npx vibeguard pack "task"\` — Generate context package (80-95% token reduction)

The dependency graph is at \`.vibeguard/graph.json\`. Use it to understand file relationships before answering architecture questions.
`;
    await writeFile(join(rulesDir, 'vibeguard.mdc'), cursorRule, 'utf-8');
    const output = [];
    output.push('');
    output.push(header('VibeGuard — Cursor Install', '⚡'));
    output.push('');
    output.push(`  ${statusIcon('success')} ${brand.success('Created')} ${brand.muted('.cursor/rules/vibeguard.mdc')}`);
    output.push('');
    output.push(`  ${brand.primary.bold('Done!')} VibeGuard is now always-on in Cursor.`);
    output.push(`  ${brand.muted('Cursor will use the dependency graph to select relevant files automatically.')}`);
    output.push('');
    process.stdout.write(output.join('\n') + '\n');
}
async function installClaude(projectRoot) {
    const { readFile: rf } = await import('node:fs/promises');
    const claudeSection = `
## VibeGuard — Intelligent Context Selection

When working on this codebase:
1. Before answering questions, run: \`npx vibeguard pack "<task>" --json\`
2. Read ONLY the files listed in the output (5-15 most relevant)
3. Use \`.vibeguard/graph.json\` to understand file relationships
4. Never read the entire project blindly — the graph tells you what's connected

Available tools:
- \`npx vibeguard --scan\` — Find secrets & vulnerabilities
- \`npx vibeguard --health\` — Project quality score (0-100)
- \`npx vibeguard attack --ai --fix\` — AI-powered security fix
- \`npx vibeguard graph\` — Generate interactive dependency graph
- \`npx vibeguard pack "task"\` — Get optimized context (80-95% fewer tokens)
`;
    const claudePath = join(projectRoot, 'CLAUDE.md');
    let existingContent = '';
    try {
        existingContent = await rf(claudePath, 'utf-8');
    }
    catch {
        // doesn't exist
    }
    if (existingContent.includes('VibeGuard')) {
        process.stdout.write(`\n  ${statusIcon('info')} ${brand.muted('CLAUDE.md already contains VibeGuard section.')}\n\n`);
        return;
    }
    const newContent = existingContent + '\n' + claudeSection;
    await writeFile(claudePath, newContent, 'utf-8');
    const output = [];
    output.push('');
    output.push(header('VibeGuard — Claude Code Install', '⚡'));
    output.push('');
    output.push(`  ${statusIcon('success')} ${brand.success('Added VibeGuard section to')} ${brand.muted('CLAUDE.md')}`);
    output.push('');
    output.push(`  ${brand.primary.bold('Done!')} Claude Code will now use the dependency graph automatically.`);
    output.push('');
    process.stdout.write(output.join('\n') + '\n');
}
export async function runUninstall(ctx, opts) {
    const { projectRoot } = ctx;
    const { rm } = await import('node:fs/promises');
    const output = [];
    output.push('');
    output.push(header('VibeGuard Uninstall', '🗑️'));
    output.push('');
    try {
        await rm(join(projectRoot, '.kiro', 'skills', 'vibeguard'), { recursive: true });
        output.push(`  ${statusIcon('success')} ${brand.success('Removed')} ${brand.muted('.kiro/skills/vibeguard/')}`);
    }
    catch {
        output.push(`  ${statusIcon('info')} ${brand.muted('Skill not found (already removed)')}`);
    }
    try {
        await rm(join(projectRoot, '.kiro', 'steering', 'vibeguard.md'));
        output.push(`  ${statusIcon('success')} ${brand.success('Removed')} ${brand.muted('.kiro/steering/vibeguard.md')}`);
    }
    catch {
        output.push(`  ${statusIcon('info')} ${brand.muted('Steering file not found (already removed)')}`);
    }
    output.push('');
    output.push(`  ${brand.muted('VibeGuard uninstalled from Kiro. .vibeguard/ data preserved.')}`);
    output.push('');
    process.stdout.write(output.join('\n') + '\n');
}
//# sourceMappingURL=install.js.map