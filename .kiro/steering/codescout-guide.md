---
inclusion: auto
---
# CodeScout Guide — Smart Context Engine (Always-On)

> This is the always-on **guidance** file (auto-loaded every turn). You do NOT
> pick this in the chat box. To run CodeScout, pick the **`codescout` skill** (or
> type `/codescout <task>`) — that is what builds the map and packs context.

CodeScout is installed in this project. It provides **graph-first intelligent file selection** to minimize token usage and maximize answer quality.

## How to Use

Type `/codescout <task>` for any question or task. Examples:
- `/codescout fix the authentication bug`
- `/codescout explain how the context engine works`
- `/codescout add rate limiting to the API`
- `/codescout refactor the security scanner`

## What Happens Behind the Scenes

1. **Graph** — CodeScout loads the pre-computed dependency graph (`.codescout/graph.json`)
2. **Match** — Your task is matched against file tags (derived from names, exports, paths)
3. **Expand** — Matched files are expanded along import/dependent edges with decay
4. **Budget** — Files are added until the token budget is reached (default 12K tokens)
5. **Visualize** — Shows which files were selected and how they connect
6. **Answer** — Only the selected files (5-15) are read — NOT the whole project

If no files match (generic prompt), CodeScout asks the AI which files are relevant using ONLY the file list (not content) — ~300 tokens.

## IMPORTANT: Always Use Graph-First

When answering questions about this codebase:
1. **DO NOT** blindly read all files — use `/codescout pack "task"` or the context engine
2. **DO** check `.codescout/context-package.md` if it exists (from a recent pack)
3. **DO** use the dependency graph to understand file relationships
4. **DO** start from entrypoints and follow imports rather than scanning randomly

## Quick Commands

| Command | What it does |
|---------|-------------|
| `/codescout <task>` | Smart context selection + answer |
| `/codescout scan` | Security scan with fixes |
| `/codescout attack` | Cyberattack vulnerability scan |
| `/codescout health` | Project health score (0-100) |
| `/codescout dead` | Dead code detection |
| `/codescout map` | Rebuild the dependency graph (run once after big code changes) |
| `/codescout fix` | Auto-fix security issues |

> **Cost note:** `/codescout map` and tag/radius selection are 100% local (no tokens).
> The only token cost of `/codescout <task>` is reading the 5-15 selected files —
> far cheaper than scanning the whole project. Rebuild the map with `/codescout map`
> only when files changed a lot; otherwise the cached graph is reused for free.

## Context Package

After any `/codescout` command, optimized context is available at:
- `.codescout/context-package.md` — Human-readable
- `.codescout/context-package.json` — Machine-readable

#[[file:.codescout/context-package.md]]
