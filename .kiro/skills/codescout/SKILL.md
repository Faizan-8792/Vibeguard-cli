---
name: codescout
description: Pick THIS to run CodeScout. Graph-first context engine — auto-builds the dependency map, packs only the relevant files, then answers. Also security scan, attack scan, dead-code & health. Trigger with /codescout.
---
# CodeScout Skill

Local-only TypeScript/JavaScript static analysis, security scanning, dead code detection, and AI context packaging.

## Trigger

When the user types `/codescout` followed by anything (a command or a task description), execute the corresponding flow.

## Core Flow: Smart Context Selection (Default)

When the user types `/codescout <any task or question>` (not a known command):

### Step 1: Ensure graph exists
Run: `npx codescout map --json --cwd {projectRoot}`
If already cached (check `.codescout/graph.json` timestamp), skip.

### Step 2: Select relevant files
Run: `npx codescout pack "<user's task>" --json --cwd {projectRoot}`

This does:
- Normalizes the task text
- Matches against file tags from the dependency graph
- Expands by import/dependent radius
- Applies token budget constraint

### Step 3: If no match (generic/casual prompt)
If `selectedFiles` is empty and the user has an LLM configured:
- CodeScout uses AI file selection (sends only file names + tags, NOT content — very cheap ~300 tokens)
- Falls back to selecting the top 5-8 most connected/important files

### Step 4: Read selected files and use as context
Read the content of selected files. Use this as focused context to answer the user's question or implement their task.

### Step 5: Show the dependency graph
Display the connections between selected files as a visual tree showing imports and dependents.

## Output Ordering (IMPORTANT)

Always present results in **chronological / natural reading order — newest at the BOTTOM**:

1. First: the steps you ran (map / pack) and any CLI output, oldest first.
2. Then: the dependency graph / selected-file list.
3. **Last (at the very bottom): your actual answer or the latest CLI result.**

Never put the most recent CLI output or the final answer at the top. The user reads
top-to-bottom, so the latest/most-relevant content must be the last thing shown. Do not
reverse, re-order, or hoist recent output above earlier output.

**Key principle**: Never read the entire project blindly. Always go through the graph first. Only the most relevant 5-15 files get read — this is 80-95% fewer tokens than blind reading.

## Known Commands

### `/codescout scan`
Run: `npx codescout security --json --cwd {projectRoot}`
Present issues with severity, file, line, message, and suggested fix.

### `/codescout attack`
Run: `npx codescout attack --json --cwd {projectRoot}`
Show cyberattack vulnerabilities with recommendations.

### `/codescout health`
Run: `npx codescout doctor --json --cwd {projectRoot}`
Present health scores and suggestions.

### `/codescout dead`
Run: `npx codescout clean --plan --json --cwd {projectRoot}`
Show dead code candidates sorted by importance.

### `/codescout map`
Run: `npx codescout map --json --cwd {projectRoot}`
Rebuild the dependency graph and show graph statistics. Run this once after large
code changes; otherwise the cached graph is reused (no tokens).

### `/codescout fix`
Run: `npx codescout security --fix=gitignore --cwd {projectRoot}`
Auto-fix .gitignore issues.

### `/codescout attack --ai --fix`
Run: `npx codescout attack --ai --fix --cwd {projectRoot}`
AI-powered security scan + auto-fix.

### `/codescout`
Show available commands.

## How it Optimizes Token Usage

1. **Graph-first**: File relationships are pre-computed locally (no tokens used)
2. **Tag matching**: Tasks are matched to files via keyword/tag analysis (no tokens used)
3. **Radius expansion**: Related files found by following imports/dependents (no tokens used)
4. **Budget constraint**: Stops adding files when token budget is reached
5. **AI fallback only when needed**: If local matching fails, asks AI using ONLY file names (not content) — ~300 tokens
6. **Selective reading**: Only 5-15 files are read instead of the entire project

Result: 80-95% fewer tokens per query vs reading the full codebase.

## Notes
- All analysis is local — no API calls for graph/tag/importance computation
- AI is only used when: (a) tag matching returns 0 results, or (b) user explicitly requests `--ai`
- Files are cached in `.codescout/` — incremental rebuilds only re-process changed files
- The dependency graph visualization shows HOW files connect, helping understand code architecture
