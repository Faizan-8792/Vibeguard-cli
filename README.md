<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=800&size=36&pause=1000&color=7C3AED&center=true&vCenter=true&width=500&lines=VIBEGUARD;AI+Context+Optimizer;Security+Scanner;Dead+Code+Killer" alt="VibeGuard" />
</p>

<p align="center">
  <strong>Make AI coding assistants understand your codebase 80-95% cheaper.</strong><br/>
  Local-only security scanning, dead code detection, cyberattack protection, and intelligent context packaging.
</p>

<p align="center">
  <a href="https://github.com/Faizan-8792/VIBEGUARD-/actions"><img src="https://img.shields.io/badge/build-passing-brightgreen?style=flat-square" alt="Build"/></a>
  <a href="https://github.com/Faizan-8792/VIBEGUARD-/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"/></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-green?style=flat-square" alt="Node"/>
  <img src="https://img.shields.io/badge/tests-89%20passing-brightgreen?style=flat-square" alt="Tests"/>
  <img src="https://img.shields.io/badge/health-93%2F100-purple?style=flat-square" alt="Health"/>
  <img src="https://img.shields.io/badge/zero%20dependencies-local%20only-orange?style=flat-square" alt="Local"/>
</p>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=14&pause=2000&color=06B6D4&center=true&vCenter=true&width=600&lines=npx+vibeguard+--run+%E2%86%92+Interactive+security+%2B+dead+code+%2B+AI+context;npx+vibeguard+--scan+%E2%86%92+Find+secrets+%26+vulnerabilities+in+seconds;npx+vibeguard+--health+%E2%86%92+Project+quality+score+0-100;npx+vibeguard+attack+--ai+--fix+%E2%86%92+AI-powered+auto-fix" alt="Commands" />
</p>

---

## What is VibeGuard?

VibeGuard is a **local-only CLI tool** that sits between your codebase and AI coding assistants. It ensures you never waste tokens by sending irrelevant code to AI, detects security vulnerabilities, removes dead code, and protects against 18 types of cyberattacks — all without any API keys for core features.

```
┌─────────────────────────────────────────────────────────────────┐
│  Your Project (200 files, 150K tokens)                          │
│                         │                                       │
│                    VibeGuard                                     │
│                    ┌───────┐                                     │
│                    │ Graph │──→ Tags ──→ Importance              │
│                    │  Map  │──→ Radius ──→ Budget                │
│                    └───────┘                                     │
│                         │                                       │
│              Selected: 5-15 files (~8K tokens)                  │
│                         │                                       │
│                    AI Assistant                                  │
│              (94% fewer tokens, better answers)                  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# One command to start
npx vibeguard --run
```

This launches the **interactive mode** — a beautiful terminal UI where you can:
- 🔒 Scan for secrets & vulnerabilities
- 🛡️ Detect cyberattack vectors (DDoS, SQLi, XSS, OTP abuse...)
- 🏥 Get a project health score
- 🧹 Find and remove dead code
- 📦 Generate optimized AI context packages
- 🤖 AI-powered auto-fix (with your LLM key)

## Install

```bash
# Run directly (no install needed)
npx vibeguard --run

# Or install globally
npm install -g vibeguard

# Or install as Kiro skill (always-on in chat)
npx vibeguard install
```

## Commands

### One-Flag Shortcuts

```bash
npx vibeguard --run        # Interactive mode (recommended)
npx vibeguard --scan       # Security scan
npx vibeguard --health     # Health score
npx vibeguard --graph      # Build dependency graph
npx vibeguard --dead       # Dead code detection
```

### Full Commands

| Command | Description |
|---------|-------------|
| `vibeguard init` | Initialize configuration |
| `vibeguard map` | Build dependency graph |
| `vibeguard security` | Security scan (secrets, CORS, .env gaps) |
| `vibeguard security --fix gitignore` | Auto-fix .gitignore |
| `vibeguard security --fix env` | Move secrets to .env |
| `vibeguard attack` | Cyberattack vulnerability scan (18 attack types) |
| `vibeguard attack --ai` | AI-powered deep scan |
| `vibeguard attack --ai --fix` | AI scan + auto-fix vulnerabilities |
| `vibeguard clean --plan` | Detect dead code |
| `vibeguard clean --apply` | Move dead files to trash (reversible) |
| `vibeguard pack "task"` | Generate AI context package |
| `vibeguard doctor` | Project health score (0-100) |
| `vibeguard trash list` | View soft-deleted files |
| `vibeguard trash restore <id>` | Restore a file |
| `vibeguard config set-key <key>` | Add LLM API key |
| `vibeguard config providers` | List 15 supported LLM providers |
| `vibeguard install` | Install as Kiro/editor skill |

## 🛡️ Cyberattack Protection (18 Attack Types)

```bash
npx vibeguard attack --ai --fix
```

Detects and auto-fixes:

| Attack | Detection |
|--------|-----------|
| DDoS / Resource Exhaustion | Missing rate limiting |
| Brute Force / Credential Stuffing | No attempt limits on login |
| OTP Abuse / SMS Bombing | No cooldown on OTP senders |
| SQL Injection | String interpolation in queries |
| NoSQL Injection | `$where` with user input |
| Cross-Site Scripting (XSS) | `innerHTML` without sanitization |
| Command Injection | `exec()` with interpolated input |
| Path Traversal | User-controlled file paths |
| SSRF | Fetch to user-controlled URLs |
| CSRF | State-changing routes without tokens |
| Weak Cryptography | MD5/SHA1 for security |
| Weak Password Hashing | Fast hash for passwords |
| Insecure Randomness | `Math.random()` for tokens |
| Open Redirect | Redirect to user-controlled URL |
| Missing Security Headers | No helmet/CSP |
| Prototype Pollution | Deep merge of untrusted objects |
| Arbitrary Code Execution | `eval()` / `new Function()` |
| Mass Assignment | `req.body` passed directly to ORM |

## 📦 AI Context Optimization

The killer feature — reduces AI token usage by **80-95%**:

```bash
npx vibeguard pack "fix the authentication login flow"
```

**How it works:**
1. **Normalize** — strips stopwords, stems task text
2. **Tag Match** — matches against file tags (from paths, exports, framework patterns)
3. **Importance Weight** — scores by `(dependents×5 + imports×2 + git×3 + route×4)`
4. **Graph Radius** — expands through imports/dependents with 0.5× decay per hop
5. **Budget Constraint** — stops at 12K tokens

**Result:** 5-15 files instead of 200+ → AI gets focused, relevant context.

## 🔑 LLM Provider Support (15 Providers)

```bash
vibeguard config set-key <key>    # Auto-detects provider from key prefix
vibeguard config providers        # List all
```

| Provider | Default Model |
|----------|--------------|
| OpenRouter | claude-3.5-haiku |
| OpenAI / ChatGPT | gpt-4o-mini |
| Anthropic Claude | claude-3-5-haiku |
| Google Gemini | gemini-1.5-flash |
| DeepSeek | deepseek-chat |
| Groq | llama-3.3-70b |
| Mistral | mistral-small |
| xAI Grok | grok-2-latest |
| Together AI | Llama-3.3-70B |
| Perplexity | sonar-small |
| Fireworks | llama-v3p3-70b |
| DeepInfra | Llama-3.3-70B |
| Moonshot / Kimi | moonshot-v1-8k |
| Ollama (local) | llama3.2 |
| Custom | Any OpenAI-compatible |

## 🏥 Health Score

```bash
npx vibeguard --health
```

```
  🏥 Project Health Report
  ──────────────────────────────────────────────────

  ✔ Overall Health: 93/100

  Security               ████████████████████ 100/100
  Dead Code              ██████████████████░░ 93/100
  Architecture           ████████████████████ 100/100
  Context Efficiency     ████████████████░░░░ 79/100
```

## Kiro Integration

```bash
npx vibeguard install
```

After installing, type `/vibeguard` in Kiro chat:
- `/vibeguard scan` — Security scan
- `/vibeguard health` — Health score
- `/vibeguard pack "task"` — AI context package
- `/vibeguard attack` — Cyberattack scan

The always-on steering file ensures VibeGuard's graph-first approach is used automatically — the AI never blindly reads your entire project.

## Programmatic API

```typescript
import { runCommand, generateContextForEditor, serializeContextPackageForAgent } from 'vibeguard';

// Generate optimized context for any task
const pkg = await generateContextForEditor('fix auth login', {
  radius: 2,
  budget: 15000,
  mode: 'bugfix',
});

// Get markdown for AI consumption
const md = serializeContextPackageForAgent(pkg);
```

## Safety Guarantees

| Guarantee | How |
|-----------|-----|
| Read-only by default | No mutations without explicit `--fix`/`--apply` |
| Soft deletes only | Files go to `.vibeguard-trash/`, never hard-deleted |
| Project boundary | Never touches files outside project root |
| No destructive git | Never runs push, reset --hard, force |
| No network (core) | Graph, tags, scan all run locally |
| Dry-run support | `--dry-run` on all mutating commands |
| Git-safe mode | `--git-safe` creates branch + commits |
| Backup before AI fix | Originals saved before AI rewrites |

## Architecture

```
src/
├── cli.ts                         Entry point + shorthand flags
├── api.ts                         Programmatic API
├── commands/                      11 command handlers
│   ├── interactive.ts             Arrow-key menu (--run)
│   ├── attack.ts                  Cyberattack scan + AI fix
│   ├── config.ts                  LLM key management
│   └── ...
├── engines/                       12 analysis engines
│   ├── graph-builder.ts           ts-morph AST → dependency graph
│   ├── attack-scanner.ts          18 attack pattern detectors
│   ├── ai-fixer.ts                AI-powered code remediation
│   ├── context-radius-engine.ts   Task → files selection
│   ├── graph-visualizer.ts        ASCII dependency visualization
│   └── ...
├── storage/                       Config, files, credentials, trash
└── utils/                         Logger, UI, git, safety, hashing
```

## Contributing

```bash
git clone https://github.com/Faizan-8792/VIBEGUARD-.git
cd VIBEGUARD-
npm install
npm run build
npm test          # 89 tests
```

## License

MIT

---

<p align="center">
  <sub>Built with TypeScript • Zero cloud dependencies • 89 tests • Health score 93/100</sub>
</p>
