# VibeGuard v1.0 Roadmap

Goal: Beat Graphify in usability, cost-efficiency, and feature coverage.

## Progress Tracker

### Day 1: Foundation
- [ ] Interactive HTML graph visualization
- [ ] npm publish readiness
- [ ] `vibeguard cursor install`
- [ ] `vibeguard claude install`
- [ ] Build, test, push

### Day 2: Platforms + Graph Depth
- [ ] `vibeguard copilot install`
- [ ] `vibeguard gemini install`
- [ ] `vibeguard aider install`
- [ ] Semantic edges (function calls, not just imports)
- [ ] Confidence scoring on edges

### Day 3: Python Support
- [ ] Python import parser (regex-based, no tree-sitter needed)
- [ ] Python dead code detection
- [ ] Python security patterns (eval, subprocess, pickle, etc.)
- [ ] Test with a real Python project
- [ ] Python file tagging

### Day 4: Go Support
- [ ] Go import parser
- [ ] Go dead code detection
- [ ] Go security patterns
- [ ] Go file tagging
- [ ] Test with a real Go project

### Day 5: Java Support
- [ ] Java import parser
- [ ] Java dead code detection
- [ ] Java security patterns (SQLi, deserialization, etc.)
- [ ] Java file tagging
- [ ] Test with a real Java project

### Day 6: Multimodal — Docs
- [ ] Markdown file parsing (extract headings, links, concepts)
- [ ] Link documentation to code files via references
- [ ] README/docs influence on tagging
- [ ] Architecture doc extraction
- [ ] Test with a project containing docs

### Day 7: Multimodal — PDF
- [ ] PDF text extraction (pdf-parse)
- [ ] Concept extraction from PDF content
- [ ] Link PDF concepts to graph nodes
- [ ] `vibeguard add <file.pdf>` command
- [ ] Test with technical papers/specs

### Day 8: Graph Intelligence
- [ ] Community detection (connected component clustering)
- [ ] God-node identification (highest degree nodes)
- [ ] Surprising connections (cross-community edges)
- [ ] GRAPH_REPORT.md auto-generation
- [ ] Suggested questions from graph structure

### Day 9: Query Engine
- [ ] `vibeguard query "what connects X to Y?"`
- [ ] `vibeguard path A B` (shortest path between nodes)
- [ ] `vibeguard explain <node>` (plain-language explanation)
- [ ] Query result token budgeting
- [ ] Test query accuracy

### Day 10: Watch + Auto
- [ ] `vibeguard watch` — file watcher with auto-rebuild
- [ ] Post-commit hook auto-graph-update (code changes: instant, docs: notify)
- [ ] Incremental tag/importance refresh
- [ ] Performance optimization for large projects
- [ ] Benchmark: compare token usage VibeGuard vs Graphify on same project

## Metrics to Beat

| Metric | Graphify | VibeGuard Target |
|--------|----------|-----------------|
| Graph build cost | ~5000-50000 tokens | 0 tokens (local) |
| Query cost | Reads compact graph | Reads compact graph |
| Security scanning | ❌ None | ✅ 18+ attack types |
| Languages | 25 | 10+ (TS, JS, Python, Go, Java, Rust...) |
| Platforms | 15+ | 10+ |
| Multimodal | PDF, images, video | PDF, docs, markdown |
| Graph output | Interactive HTML | Interactive HTML |
