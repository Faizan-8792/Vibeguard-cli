---
inclusion: auto
---
# CodeScout — Always-On Context

CodeScout is installed in this project. Type `/codescout` in chat to use it.

## Quick Commands
- `/codescout scan` — Security scan with fixes
- `/codescout health` — Project health score
- `/codescout pack "task"` — Optimized context (80-95% fewer tokens)
- `/codescout context "task"` — Generate and auto-include context
- `/codescout dead` — Dead code detection
- `/codescout map` — Dependency graph
- `/codescout fix` — Auto-fix security issues

## When to Use
- Before architecture questions: `/codescout pack "question"`
- Before making changes: `/codescout context "task"`
- After changes: `/codescout scan`
- Periodically: `/codescout health`

#[[file:.codescout/context-package.md]]
