# VibeGuard

Local-only CLI tool for TypeScript/JavaScript static analysis, dead code detection, security scanning, and AI context packaging.

## Installation

```bash
npm install -g vibeguard
```

Requires Node.js >= 18.

## Quick Start

```bash
# Initialize configuration
vibeguard init

# Build dependency graph
vibeguard map

# Scan for security issues
vibeguard security

# Detect dead code
vibeguard clean --plan

# Generate context package for AI
vibeguard pack "fix authentication login flow"

# Get project health score
vibeguard doctor

# Manage soft-deleted files
vibeguard trash list
```

## Commands

### `vibeguard init`

Initialize `.vibeguard/` configuration directory with default settings.

```bash
vibeguard init          # Create config (fails if exists)
vibeguard init --force  # Overwrite existing config
```

JSON output:
```json
{
  "schemaVersion": "1.0.0",
  "message": "Initialized .vibeguard/config.json",
  "path": "/project/.vibeguard/config.json"
}
```

### `vibeguard map`

Build and persist the project dependency graph using ts-morph. Supports incremental rebuilds — only changed files are re-parsed.

```bash
vibeguard map
vibeguard map --json
```

JSON output:
```json
{
  "schemaVersion": "1.0.0",
  "summary": { "nodes": 42, "edges": 87, "rebuilt": 3, "skipped": 39 },
  "graphPath": ".vibeguard/graph.json"
}
```

### `vibeguard security`

Detect security issues: hard-coded secrets (OpenAI, AWS, Anthropic, Supabase, JWT, database URLs), `.env`/`.gitignore` gaps, and framework misuse (CORS wildcards).

```bash
vibeguard security
vibeguard security --json
vibeguard security --fix gitignore          # Add missing .gitignore entries
vibeguard security --fix env                # Move secrets to .env
vibeguard security --fix gitignore --dry-run  # Preview changes
vibeguard security --fix env --git-safe     # Create branch + commit
```

JSON output:
```json
{
  "schemaVersion": "1.0.0",
  "issues": [
    {
      "id": "SEC-001-a1b2c3d4",
      "category": "hard-coded-secret",
      "severity": "critical",
      "message": "Hard-coded OpenAI API key detected",
      "file": "src/config.ts",
      "line": 5,
      "suggestedFix": "Move to environment variable: process.env.OPENAI_API_KEY"
    }
  ],
  "counts": { "critical": 1, "high": 0, "medium": 0, "low": 0, "info": 0 }
}
```

### `vibeguard clean`

Detect dead code (unreachable files, unused exports) and stage cleanup actions.

```bash
vibeguard clean --plan          # Generate cleanup plan
vibeguard clean --apply         # Apply plan (move files to trash)
vibeguard clean --apply --dry-run   # Preview without changes
vibeguard clean --apply --git-safe  # Create branch + commit
vibeguard clean --apply --force     # Override file count limit
```

JSON output (--plan):
```json
{
  "schemaVersion": "1.0.0",
  "candidates": [
    { "id": "dead-file-src-old", "path": "src/old.ts", "kind": "file", "importance": 2 }
  ],
  "summary": { "unusedFiles": 3, "unusedExports": 5, "unusedImports": 0, "duplicateComponents": 0 }
}
```

### `vibeguard pack <task>`

Generate a focused context package for AI assistants. Matches task text against file tags, expands by graph radius, and applies token budget constraints.

```bash
vibeguard pack "fix user authentication"
vibeguard pack "add payment integration" --radius 3 --budget 20000
vibeguard pack "refactor database layer" --mode refactor
vibeguard pack --task-file task.md --json
```

Modes: `feature` (boosts routes/components), `bugfix` (boosts recently changed files), `refactor` (boosts high fan-in files).

JSON output:
```json
{
  "schemaVersion": "1.0.0",
  "selectedFiles": [
    { "path": "src/auth.ts", "tags": ["auth", "login"], "importance": 15, "role": "seed", "hopDistance": 0, "matchScore": 7.5 }
  ],
  "tokenEstimates": { "tokens": 8500, "range": { "low": 6800, "high": 10200 }, "perModel": {} },
  "costEstimates": {},
  "packagePaths": { "md": ".vibeguard/context-package.md", "json": ".vibeguard/context-package.json" },
  "warnings": []
}
```

### `vibeguard doctor`

Aggregate findings into a Project Health Score (0–100) with sub-scores for security, dead code, architecture, and context efficiency.

```bash
vibeguard doctor
vibeguard doctor --json
```

JSON output:
```json
{
  "schemaVersion": "1.0.0",
  "summary": {
    "projectHealth": 78,
    "security": 80,
    "deadCode": 90,
    "architecture": 72,
    "contextEfficiency": 70
  },
  "issues": [],
  "warnings": []
}
```

### `vibeguard trash <action>`

Manage soft-deleted artifacts. Files removed by `clean --apply` are moved to `.vibeguard-trash/` and can be restored.

```bash
vibeguard trash list                  # List trashed files
vibeguard trash restore <id|path>     # Restore a file
vibeguard trash restore <id> --force  # Overwrite if target exists
vibeguard trash purge --yes           # Permanently delete all trash
```

JSON output (list):
```json
{
  "schemaVersion": "1.0.0",
  "entries": [
    { "id": "uuid-here", "originalPath": "src/old.ts", "movedAt": "2025-01-01T00:00:00.000Z", "importance": 2, "kind": "file" }
  ]
}
```

## Global Options

| Option | Description |
|--------|-------------|
| `--json` | Output results as JSON to stdout |
| `--cwd <path>` | Set working directory |
| `--include <globs...>` | Include only files matching these globs |
| `--exclude <globs...>` | Exclude files matching these globs |
| `--config <path>` | Path to configuration file |
| `--verbose` | Enable debug output |
| `--quiet` | Suppress info and debug output |
| `--help` | Show help |
| `--version` | Show version |

## Configuration

Configuration lives in `.vibeguard/config.json`. Run `vibeguard init` to create it with defaults.

```json
{
  "ignore": ["node_modules/**", "dist/**", "build/**", "coverage/**"],
  "tags": { "customRules": [{ "match": "src/api/**", "add": ["api", "backend"] }] },
  "importance": { "weights": { "dependents": 5, "imports": 2, "git": 3, "route": 4 } },
  "security": { "customSecretPatterns": ["CUSTOM_[A-Z]+_KEY"] },
  "context": { "defaultRadius": 2, "defaultTokenBudget": 12000, "models": {} },
  "clean": { "maxChangesPerRun": 50 },
  "limits": { "maxFilesPerRun": 200 }
}
```

## Programmatic API

```typescript
import { runCommand, generateContextForEditor, serializeContextPackageForAgent } from 'vibeguard';

// Run any command programmatically
const result = await runCommand('doctor', [], { cwd: '/path/to/project' });

// Generate context for an editor/AI integration
const pkg = await generateContextForEditor('fix auth login', {
  radius: 2,
  budget: 15000,
  mode: 'bugfix',
  cwd: '/path/to/project',
});

// Serialize for agent consumption
const markdown = serializeContextPackageForAgent(pkg);
```

## Safety Guarantees

- **Read-only by default**: No command modifies files unless `--fix`, `--apply`, or `--force` is used
- **Soft deletes only**: `clean --apply` moves files to `.vibeguard-trash/`, never hard-deletes
- **Dry-run support**: All mutating commands support `--dry-run` to preview changes
- **Git safety**: `--git-safe` creates a branch and commits changes atomically
- **Project boundary**: Never modifies files outside the project root
- **No network**: Fully local, no remote AI calls, no credentials required
- **No destructive git**: Never executes `git push`, `git reset --hard`, or history-rewriting commands

## License

MIT
