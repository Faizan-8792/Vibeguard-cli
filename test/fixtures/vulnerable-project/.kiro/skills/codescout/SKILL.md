# CodeScout Skill

Local-only TypeScript/JavaScript static analysis, security scanning, dead code detection, and AI context packaging.

## Trigger

When the user types `/codescout` followed by a command, execute the corresponding action.

## Commands

### `/codescout scan`
Run security scan on the current project. Detect hard-coded secrets, .env/.gitignore gaps, and framework misuse.

Execute: `npx codescout security --json`

Parse the JSON output and present issues with severity, file, line, message, and suggested fix.

### `/codescout health`
Get project health score (0-100) with sub-scores.

Execute: `npx codescout doctor --json`

### `/codescout pack <task>`
Generate an optimized context package for a specific task (80-95% token reduction).

Execute: `npx codescout pack "<task>" --json`

After generating, read `.codescout/context-package.md` and use it as context.

### `/codescout dead`
Detect dead code: unused files, unused exports.

Execute: `npx codescout clean --plan --json`

### `/codescout map`
Build the dependency graph.

Execute: `npx codescout map --json`

### `/codescout context <task>`
Generate context package and auto-include it in the conversation.

Execute:
1. `npx codescout pack "<task>" --json`
2. Read `.codescout/context-package.md`
3. Use as context for subsequent responses

### `/codescout fix`
Auto-fix security issues.

Execute: `npx codescout security --fix=gitignore`

### `/codescout`
Show available commands.

## Notes
- All commands are local-only, no network calls
- Results cached in `.codescout/` for incremental rebuilds
- Use `pack` before complex questions to reduce tokens by 80-95%
