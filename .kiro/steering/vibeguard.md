---
inclusion: auto
---
# VibeGuard — Smart Context Engine (Always-On)

VibeGuard is installed in this project. It provides **graph-first intelligent file selection** to minimize token usage and maximize answer quality.

## How to Use

Type `/vibeguard <task>` for any question or task. Examples:
- `/vibeguard fix the authentication bug`
- `/vibeguard explain how the context engine works`
- `/vibeguard add rate limiting to the API`
- `/vibeguard refactor the security scanner`

## What Happens Behind the Scenes

1. **Graph** — VibeGuard loads the pre-computed dependency graph (`.vibeguard/graph.json`)
2. **Match** — Your task is matched against file tags (derived from names, exports, paths)
3. **Expand** — Matched files are expanded along import/dependent edges with decay
4. **Budget** — Files are added until the token budget is reached (default 12K tokens)
5. **Visualize** — Shows which files were selected and how they connect
6. **Answer** — Only the selected files (5-15) are read — NOT the whole project

If no files match (generic prompt), VibeGuard asks the AI which files are relevant using ONLY the file list (not content) — ~300 tokens.

## IMPORTANT: Always Use Graph-First

When answering questions about this codebase:
1. **DO NOT** blindly read all files — use `/vibeguard pack "task"` or the context engine
2. **DO** check `.vibeguard/context-package.md` if it exists (from a recent pack)
3. **DO** use the dependency graph to understand file relationships
4. **DO** start from entrypoints and follow imports rather than scanning randomly

## Quick Commands

| Command | What it does |
|---------|-------------|
| `/vibeguard <task>` | Smart context selection + answer |
| `/vibeguard scan` | Security scan with fixes |
| `/vibeguard attack` | Cyberattack vulnerability scan |
| `/vibeguard health` | Project health score (0-100) |
| `/vibeguard dead` | Dead code detection |
| `/vibeguard map` | Rebuild dependency graph |
| `/vibeguard fix` | Auto-fix security issues |

## Context Package

After any `/vibeguard` command, optimized context is available at:
- `.vibeguard/context-package.md` — Human-readable
- `.vibeguard/context-package.json` — Machine-readable

#[[file:.vibeguard/context-package.md]]
