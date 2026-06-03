<div align="center">

# 🛡️ CodeScout

### Your codebase, understood — by your AI and by you

*Map your project. Feed your AI only the files that matter. Catch secrets, attacks, and dead code.*
**100% local. No API key for the core. One command installs, one command runs.**

<br/>

[![npm](https://img.shields.io/npm/v/codescout-cli?style=for-the-badge&color=22c55e&logo=npm)](https://www.npmjs.com/package/codescout-cli)
[![Node.js >=18](https://img.shields.io/badge/Node.js-%3E%3D18-22c55e?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-388%20passing-16a34a?style=for-the-badge)](#-development)
[![License: MIT](https://img.shields.io/badge/license-MIT-f59e0b?style=for-the-badge)](LICENSE)

<br/>

[**1. Install**](#-step-1--install) ·
[**2. Run**](#-step-2--run-it) ·
[**Modes**](#-graphmode--caveman-mode) ·
[**Features**](#-features) ·
[**Commands**](#-command-map) ·
[**MCP Server**](#-mcp-server--live-agent-tools) ·
[**Security**](#-security--attack-coverage)

</div>

---

## 🚀 Step 1 — Install

The npm package is **`codescout-cli`**; the command it gives you is **`codescout`**.

```bash
# Option A — install once, globally (then `codescout` works anywhere)
npm install -g codescout-cli
codescout --run

# Option B — run without installing
npx codescout-cli --run
```

Requirements: **Node.js ≥ 18**. Git is optional (enables hooks + git-aware scoring).

### Wire it into your editor (one-shot)

Pick your editor and run one command. Each install writes the right integration file
(rules / instructions / MCP config), creates `.codescout/config.json`, enables **Caveman Mode**
+ **GraphMode**, and offers to build the dependency map — all in a single pass.

| Editor / Agent | One-shot install command | What it sets up |
| --- | --- | --- |
| **Antigravity** | `npx codescout-cli antigravity install` | `AGENTS.md` rules + `.antigravity/mcp.json` MCP server |
| **VS Code** | `npx codescout-cli vscode install` | `.github/copilot-instructions.md` + `.vscode/mcp.json` MCP server |
| **Kiro** | `npx codescout-cli kiro install` | `.kiro/skills/codescout/` skill + steering + `.kiro/settings/mcp.json` |
| **Cursor** | `npx codescout-cli cursor install` | `.cursor/rules/codescout.mdc` always-on rule + `.cursor/mcp.json` |
| **Claude Code** | `npx codescout-cli claude install` | `CLAUDE.md` integration section |
| **GitHub Copilot** | `npx codescout-cli copilot install` | `.github/copilot-instructions.md` |
| **Gemini** | `npx codescout-cli gemini install` | `.gemini/CONTEXT.md` + `.gemini/settings.json` |
| **Aider** | `npx codescout-cli aider install` | `.aider.context.md` (+ `.aider.conf.yml` if absent) |

Generic form + opt-outs:

```bash
# Any platform
npx codescout-cli install --platform <kiro|cursor|claude|copilot|vscode|codex|gemini|aider|antigravity>

# Lean install (skip a step)
npx codescout-cli install --platform vscode --no-caveman   # skip Caveman Mode
npx codescout-cli install --platform vscode --no-map       # skip the graph build
npx codescout-cli install --platform kiro --caveman ultra  # pick a Caveman level
```

> **After install, reload your editor / start a new chat** so it picks up the new rule + MCP server.
> Remove anytime with `npx codescout-cli <platform> uninstall` — your `.codescout/` data is preserved.

---

## ▶️ Step 2 — Run it

The fastest way to use everything is the interactive menu:

```bash
codescout --run          # if installed globally
npx codescout-cli --run  # otherwise
```

It opens a menu ordered for a fresh project — **Quick Setup** first, then the modes, then scans:

```
Quick Setup            — Install all & become ready
GraphMode              — Use graph for token savings
Caveman Mode           — Save tokens & boost speed
Cyberattack Proof      — Scan for DDoS, SQLi, XSS, OTP abuse...
Security Scan          — Find secrets & vulnerabilities
Security Audit         — Deps (CVE), taint, misconfig + SBOM
Health Check           — Project health score
Dead Code Detection    — Find unused files & exports
Context Package        — Generate AI context
Trash Manager          — View soft-deleted files
Initialize Config      — Setup .codescout/
Configure LLM          — Add API key (OpenAI, Gemini, DeepSeek...)
```

**Quick Setup** does it all in one pick: init config, enable Caveman + GraphMode, then asks **how**
to build the dependency map (see [GraphMode](#-graphmode--caveman-mode) below).

Prefer flags? Every action has a one-line shortcut:

```bash
npx codescout-cli --scan      # security scan
npx codescout-cli --health    # project health score (0-100)
npx codescout-cli --graph     # build + open the dependency graph
npx codescout-cli --dead      # detect dead code
```

---

## 💡 Why CodeScout?

AI assistants are strongest when they read the **right** code, not **all** the code.
CodeScout builds a local, structured map of your project so your AI works with less
noise, fewer tokens, and higher accuracy — and you get a security and architecture
toolkit for free.

```mermaid
flowchart LR
  A[Your repo] --> B[CodeScout<br/>local analysis]
  B --> C[Dependency graph]
  B --> D[Security + audit]
  B --> E[Dead-code plan]
  C --> F[Focused context pack]
  C --> H[Interactive graph.html]
  F --> G[AI reads 5-15<br/>relevant files]
  G --> K[Cheaper + sharper<br/>AI answers]
```

> **Core promise:** graph, security, dead-code, health, query, and packaging all run
> **locally with no AI API key**. Only the optional AI map / `attack --ai` review use your LLM.

---

## 🧠 GraphMode & Caveman Mode

Two **independent**, always-on modes. Either can be on or off without affecting the other. When ON,
each makes your AI assistant print a plain one-line indicator at the top of every reply:

```
Caveman mode: ON
GraphMode: ON
```

### GraphMode — graph-first context (token savings)

```bash
codescout graphmode on       # write graph-first rules to every IDE file
codescout graphmode status   # check state + detect drift
codescout graphmode off      # remove the rules everywhere
```

When you enable GraphMode (or run Quick Setup), CodeScout asks **how to build the map**:

1. **Copy prompt for creating map** *(recommended — most accurate)* — copies a precise prompt;
   paste it into your coding agent (with repo access) and it writes `.codescout/graph.json`.
2. **Generate map using LLM** — uses your configured API key to build the map automatically.
3. **Create offline map** — local, no AI, instant (regex/AST based).

All three produce the same `graph.json` schema → identical `graph.html`. View with `codescout graph`.

### Caveman Mode — terse AI replies

Inspired by the [`caveman`](https://github.com/JuliusBrussee/caveman) skill. *(Rephrased for compliance.)*

```bash
codescout caveman on          # enable (default: full)
codescout caveman on ultra    # maximum compression
codescout caveman status      # check state + detect drift
codescout caveman off         # back to normal prose
```

| Level | Effect | ~Output savings (prose) |
| --- | --- | --- |
| `lite` | Drop filler & hedging, keep full sentences | ~20% |
| `full` | Drop articles, fragments OK (classic) | ~30% |
| `ultra` | Telegraphic, minimal words, arrows (X → Y) | ~45% |

> **Turning a mode off but still see the indicator?** The CLI strips the rule from every IDE file
> and `status` warns of any leftovers — but an **open AI chat caches instructions for its session**.
> Start a **new chat** (or reload the editor window) after toggling. Both `on` and `off` print this
> reminder, and `status` shows the exact project root + any drift so wrong-folder mistakes are obvious.

---

## ✨ Features

| | Capability |
| --- | --- |
| 🗺️ | **Dependency graph** — `graph.json`, interactive `graph.html`, `GRAPH_REPORT.md`; build offline, via LLM, or via copy-prompt |
| 🧠 | **GraphMode** — always-on graph-first context rule for your AI (independent toggle) |
| 🪨 | **Caveman Mode** — terse AI replies that trim output tokens (independent toggle) |
| 📦 | **AI context packs** — pick the few files that matter via tags, graph radius, importance & a token budget |
| 🔒 | **Security scanner** — hard-coded secrets, risky framework usage, `.env`/`.gitignore` gaps |
| 🛡️ | **Attack scanner** — 36 cyberattack patterns (SQLi, XSS, SSRF, XXE, SSTI, JWT, OTP abuse, DDoS, more) |
| 🔬 | **Unified audit** — dependency CVEs (SCA), taint dataflow, misconfig + service hardening → one 0-100 score + SBOM |
| ✂️ | **Dead-code cleanup** — works on any project (auto-detects entrypoints), plans unused files/exports into a recoverable trash |
| 🙈 | **Per-finding ignore** — silence a false positive by ID; scans never flag it again |
| ❓ | **Graph Q&A** — `query`, `path`, `explain`, `affected` — answers without reading every file |
| 🌐 | **Polyglot** — TS/JS (deep AST incl. CommonJS `require`), plus Python, Go, Java & Markdown |
| 🤝 | **Works everywhere** — Kiro, Cursor, Claude, Copilot, VS Code, Codex, Gemini, Aider, Antigravity |

---

## 🧭 Command Map

| Command | Purpose |
| --- | --- |
| `codescout --run` | Interactive menu — every feature, one keypress away |
| `codescout install --platform <name>` | One-shot editor/agent setup (or `codescout <platform> install`) |
| `codescout uninstall --platform <name>` | Remove editor/agent integration |
| `codescout init` | Initialize `.codescout/config.json` + build the graph |
| `codescout map` | Build the dependency graph (incremental, SHA-256 change detection) |
| `codescout graph --no-open` | Generate / open the interactive HTML graph |
| `codescout graphmode on\|off\|status` | Control GraphMode (graph-first AI context) |
| `codescout caveman on\|off\|status\|level` | Control Caveman Mode |
| `codescout query "question"` | Ask graph-backed questions, no full-file reads |
| `codescout path <a> <b>` | Shortest path between two nodes |
| `codescout explain <node>` | Explain a file/node role & connections |
| `codescout affected <node>` | Transitive dependents impacted by a change |
| `codescout flows` | Execution flows, bridges & knowledge gaps |
| `codescout search "query"` | Hybrid keyword + semantic search (local) |
| `codescout pack "task"` | Build `.codescout/context-package.md` + `.json` |
| `codescout benchmark` | Estimate token reduction vs full-repo reading |
| `codescout review` | Risk-scored review of changed files |
| `codescout security` | Scan secrets & framework security gaps |
| `codescout attack [--ai] [--fix]` | Cyberattack scan (+ optional AI review/fix) |
| `codescout audit [--sbom] [--min-severity]` | Unified security audit + 0-100 score |
| `codescout ignore add\|remove\|list <id>` | Suppress specific findings by ID |
| `codescout clean --plan \| --apply` | Detect dead code → recoverable trash |
| `codescout trash list \| restore <id>` | Manage soft-deleted files |
| `codescout add <file.pdf>` | Link PDF concepts into the graph |
| `codescout watch` | Rebuild graph data on file changes |
| `codescout hook install` | Pre-commit secret-blocking hook |
| `codescout serve` (alias `mcp`) | Start the MCP server (live agent tools) |
| `codescout doctor` | Aggregate findings into a 0-100 health score |
| `codescout config set-key\|show\|test` | Manage LLM provider API keys (for AI scans) |

Every machine-facing command supports `--json` and emits a `schemaVersion` field.

---

## 🔌 MCP Server — Live Agent Tools

AI assistants can call CodeScout's engines directly as **Model Context Protocol** tools over stdio.
Local, zero-network (except the optional AI scan), **13 tools**. The per-IDE installers write the
MCP config for you. Manual wiring:

**Claude Desktop / Claude Code** — `claude_desktop_config.json` or `.mcp.json`:

```jsonc
{
  "mcpServers": {
    "codescout": { "command": "npx", "args": ["-y", "codescout-cli", "serve", "--cwd", "/abs/path/to/project"] }
  }
}
```

**Kiro** — `.kiro/settings/mcp.json` · **Cursor** — `.cursor/mcp.json`:

```jsonc
{
  "mcpServers": {
    "codescout": { "command": "npx", "args": ["-y", "codescout-cli", "serve"], "disabled": false }
  }
}
```

**VS Code** — `.vscode/mcp.json` (note: VS Code uses the `servers` key):

```jsonc
{
  "servers": {
    "codescout": { "command": "npx", "args": ["-y", "codescout-cli", "serve"] }
  }
}
```

### The 13 tools

| Tool | What it returns |
| --- | --- |
| `get_minimal_context` | Ultra-compact project summary (~100 tokens). Call first. |
| `pack_context` | Focused, token-budgeted file pack for a task. |
| `query_graph` | Answer a codebase question by traversing the graph. |
| `find_path` | Shortest dependency path between two files. |
| `explain_node` | A node's role, imports, dependents, importance. |
| `get_affected` | Blast radius: what transitively depends on a node. |
| `build_graph` | Build or incrementally update the graph. |
| `detect_dead_code` | Unused files & exports. |
| `scan_security` | Secrets, framework misuse, gitignore gaps. |
| `scan_attacks` | Cyberattack vulnerabilities. |
| `get_health` | Project Health Score with sub-scores. |
| `run_audit` | Unified audit → 0-100 security score. |
| `set_caveman` | Toggle Caveman Mode. |

---

## 🗺️ Interactive Dependency Graph

`codescout graph` builds a **self-contained interactive HTML map** of your codebase
(`.codescout/graph.html`) and opens it in the browser.

```bash
codescout map      # build/refresh graph data
codescout graph    # render + open the interactive view
```

- **2D force-directed layout** — nodes auto-arrange by connectivity, then physics freezes
- **Group colors** — core, commands, engines, storage, utils, tests
- **Search box** — type a filename; matches highlight, the rest dim
- **Click a node** — highlights connections and opens a links panel (Imports / Dependents)
- **Degree-scaled nodes** — busier files render larger (god-node spotting)

Connections are extracted from **real imports** across languages and module systems — ESM
`import`, `export … from`, dynamic `import()`, CommonJS `require()`, plus Python/Go/Java/Markdown —
resolved across every extension and folder/index file.

---

## 📊 Project Snapshot

| Signal | Result |
| --- | --- |
| Test suite | **388** passing — unit, integration & property-based |
| Type gate | `npm run lint` + `npm run build` pass clean |
| Dependency graph | local, incremental, SHA-256 change detection |
| Token benchmark | graph read ≈ **88% smaller** than full-repo read |

---

## 🔐 Security & Attack Coverage

CodeScout ships **three local scanners** plus an optional AI deep-scan. All run offline with
no API key (only `attack --ai` uses your configured LLM).

```bash
codescout security                    # secret + framework scan
codescout attack                      # cyberattack pattern scan (36 types)
codescout audit                       # unified 5-engine audit + 0-100 score
codescout attack --ai --fix           # AI deep-scan + auto-fix (with backups)
```

False positive? Silence one finding by its ID — it's never flagged again:

```bash
codescout ignore add SEC-016-1a2b3c4d   # stop flagging this finding
codescout ignore list                   # see ignored findings
codescout ignore remove SEC-016-1a2b3c4d
```

### `security` — secrets & framework misuse

Hard-coded credentials and risky framework usage, low-false-positive (entropy + format +
context validation), with an `.env`/`.gitignore` gap check. Vendored / `node_modules`
(at any depth) and minified bundles are skipped to avoid noise.

### `attack` — cyberattack vulnerabilities (36 detectors, OWASP-aligned)

Mitigation-aware: a finding is suppressed when a matching defense is present in the file.

| Category | Covered attack types |
| --- | --- |
| **Injection** | SQLi (interpolation + concat), NoSQLi, XSS, command injection, XXE, insecure deserialization, SSTI, prototype pollution, `eval`/`new Function` RCE, CRLF / response splitting, LDAP injection |
| **Auth** | Brute force / credential stuffing, OTP abuse / SMS bombing, CSRF, JWT `none`-algorithm, `jwt.decode` without verify |
| **Access control** | Path traversal, SSRF, open redirect, mass assignment, unrestricted file upload, CORS origin reflection, insecure `postMessage` target |
| **Cryptography** | Weak hashing (MD5/SHA1), weak password hashing, insecure `Math.random()`, disabled TLS validation, hardcoded session secret, timing-unsafe secret compare |
| **Availability** | DDoS / resource exhaustion (missing rate limits), ReDoS (user-built RegExp) |
| **Hardening** | Missing security headers (helmet/CSP), insecure cookie flags, service bound to `0.0.0.0` |
| **Disclosure** | Sensitive data in logs, stack-trace exposure in responses |

### `audit` — unified offline audit

`codescout audit` runs **five local engines** in one pass → a single **0-100 security score**:
dependency CVEs (SCA), CycloneDX SBOM (`--sbom`), taint dataflow (sanitizer-aware), misconfiguration
+ service hardening (Dockerfile, `.env`, CI, `tsconfig`, SSH/nginx/MySQL), plus the secret + attack scanners.

Supported AI providers for `--ai`: OpenRouter, OpenAI, Anthropic, Google Gemini, DeepSeek,
Groq, Mistral, xAI, Together, Perplexity, Fireworks, DeepInfra, Moonshot/Kimi, Ollama, and
any custom OpenAI-compatible endpoint.

> **Honest limit:** these are static heuristics — they catch common, pattern-detectable
> issues, not logic flaws, business-process abuse, or runtime-only vulnerabilities. Treat
> CodeScout as a strong first line, not a full replacement for a security audit.

### Safety model

| Guarantee | Behavior |
| --- | --- |
| Local core | Graph, security, health, dead-code, query, pack need no cloud AI |
| Read-only default | Mutations require explicit `--fix`, `--apply`, or hook/integration install |
| Recoverable | Removed files go to `.codescout-trash/` |
| Project boundary | Safety checks reject paths outside the project root |
| Secrets | LLM credentials live in `.codescout/credentials.json` with restrictive perms |

---

## 🧩 Programmatic API

```ts
import { generateContextForEditor, serializeContextPackageForAgent } from 'codescout-cli';

const pkg = await generateContextForEditor('fix auth login', { radius: 2, budget: 12000, mode: 'bugfix' });
const markdown = serializeContextPackageForAgent(pkg);
```

---

## 🛠️ Development

```bash
git clone https://github.com/Faizan-8792/Vibeguard-cli.git
cd Vibeguard-cli
npm install
npm run lint     # tsc --noEmit
npm run build    # tsc
npm test         # vitest — 388 tests
```

---

<div align="center">

**MIT licensed** — see [`LICENSE`](LICENSE) · Built for developers who want their AI to *understand* the codebase, not just read it.

</div>
