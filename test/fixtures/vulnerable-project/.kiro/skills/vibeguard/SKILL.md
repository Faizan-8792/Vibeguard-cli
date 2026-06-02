# VibeGuard Skill

Local-only TypeScript/JavaScript static analysis, security scanning, dead code detection, and AI context packaging.

## Trigger

When the user types `/vibeguard` followed by a command, execute the corresponding action.

## Commands

### `/vibeguard scan`
Run security scan on the current project. Detect hard-coded secrets, .env/.gitignore gaps, and framework misuse.

Execute: `npx vibeguard security --json`

Parse the JSON output and present issues with severity, file, line, message, and suggested fix.

### `/vibeguard health`
Get project health score (0-100) with sub-scores.

Execute: `npx vibeguard doctor --json`

### `/vibeguard pack <task>`
Generate an optimized context package for a specific task (80-95% token reduction).

Execute: `npx vibeguard pack "<task>" --json`

After generating, read `.vibeguard/context-package.md` and use it as context.

### `/vibeguard dead`
Detect dead code: unused files, unused exports.

Execute: `npx vibeguard clean --plan --json`

### `/vibeguard map`
Build the dependency graph.

Execute: `npx vibeguard map --json`

### `/vibeguard context <task>`
Generate context package and auto-include it in the conversation.

Execute:
1. `npx vibeguard pack "<task>" --json`
2. Read `.vibeguard/context-package.md`
3. Use as context for subsequent responses

### `/vibeguard fix`
Auto-fix security issues.

Execute: `npx vibeguard security --fix=gitignore`

### `/vibeguard`
Show available commands.

## Notes
- All commands are local-only, no network calls
- Results cached in `.vibeguard/` for incremental rebuilds
- Use `pack` before complex questions to reduce tokens by 80-95%
