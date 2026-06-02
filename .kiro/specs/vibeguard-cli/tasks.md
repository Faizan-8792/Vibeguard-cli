# Implementation Plan: VibeGuard CLI

## Overview

This plan implements VibeGuard as a TypeScript CLI tool using `commander`, `ts-morph`, `chalk`, `ora`, and `fs-extra`. The implementation is organized into 6 phases that build incrementally — each phase produces working, testable code that integrates with previous phases.

## Tasks

- [ ] 1. Project scaffold and CLI shell
  - [ ] 1.1 Initialize package.json, tsconfig.json, and folder structure
    - Create `package.json` with `name: "vibeguard"`, `engines: { node: ">=18" }`, `bin: { vibeguard: "./dist/cli.js" }`, `files` array excluding tests and `.vibeguard*`
    - Create `tsconfig.json` targeting ES2022, strict mode, declaration emit, outDir `dist/`
    - Create directory structure: `src/`, `src/commands/`, `src/engines/`, `src/storage/`, `src/utils/`, `test/unit/`, `test/property/`, `test/integration/`, `test/fixtures/`
    - Install dependencies: `commander`, `ts-morph`, `typescript`, `chalk`, `ora`, `fs-extra`, `uuid`
    - Install dev dependencies: `vitest`, `fast-check`, `@types/node`, `@types/fs-extra`
    - _Requirements: 19.1, 19.2, 19.3_

  - [x] 1.2 Implement Logger utility (`src/utils/logger.ts`)
    - Create Logger class with `error`, `warn`, `info`, `debug` methods
    - Implement TTY detection for chalk colorization and NO_COLOR support
    - Implement ora spinner management (suppress in CI and non-TTY)
    - Implement JSON mode routing (all output to stderr, nothing to stdout)
    - Implement `--quiet` (suppress info/debug) and `--verbose` (enable debug)
    - Prefix messages with `[commandName]` in non-JSON mode
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [ ] 1.3 Implement CLI entrypoint and global options (`src/cli.ts`)
    - Register all 7 subcommands: `doctor`, `security`, `clean`, `map`, `pack`, `trash`, `init`
    - Parse global options: `--json`, `--cwd <path>`, `--include <glob...>`, `--exclude <glob...>`, `--config <path>`, `--verbose`, `--quiet`
    - Implement `--help` and `--version` (read from package.json)
    - Handle unknown commands/options: print error with offending token, exit code 2
    - Handle no-subcommand: print usage summary, exit 0
    - Wire shebang `#!/usr/bin/env node` in compiled output
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.10_

  - [ ] 1.4 Implement structured error handling (`src/utils/errors.ts`)
    - Create `VibeguardError` class with `code`, `message`, `details` fields
    - Implement top-level error handler: JSON mode emits `{ "error": {...} }` on stdout, terminal mode emits to stderr
    - Define error code constants: `CONFIG_INVALID`, `CONFIG_NOT_FOUND`, `ALREADY_EXISTS`, `PARSE_ERROR`, `GIT_UNAVAILABLE`, `DIRTY_WORKTREE`, `LIMIT_EXCEEDED`, `RESTORE_CONFLICT`, `UNKNOWN_COMMAND`, `UNKNOWN_OPTION`
    - Exit code mapping: 0 success, 1 recoverable, 2 usage, 3 internal
    - _Requirements: 1.9_


  - [ ]* 1.5 Write unit tests for CLI shell and Logger
    - Test all 7 subcommands are registered
    - Test --help prints usage, --version prints package version
    - Test unknown command exits 2 with token in message
    - Test Logger level filtering with --quiet and --verbose
    - Test Logger JSON mode routes to stderr only
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 17.1_

- [ ] 2. Core storage layer and configuration
  - [ ] 2.1 Implement File Store (`src/storage/file-store.ts`)
    - Create `read<T>(path)`, `write<T>(path, data)`, `exists(path)`, `ensureDir(path)` methods
    - All paths relative to `.vibeguard/` at Project_Root
    - Use `fs-extra` for atomic writes (write to temp, rename)
    - _Requirements: 4.2, 10.6, 11.6_

  - [ ] 2.2 Implement Config Store (`src/storage/config-store.ts`)
    - Define `VibeguardConfig` interface and `ResolvedConfig` with effective skip/include sets
    - Implement `load(projectRoot, configPath?)`: read config.json or return defaults
    - Implement schema validation: check required keys, types, reject malformed JSON with structured error
    - Implement glob merge: union of `ignore` + `--exclude` = skip set; `--include` or default extensions = candidate set
    - Implement symlink safety: reject symlinks pointing outside Project_Root
    - Define documented defaults matching Requirement 2
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 2.3 Implement Init Command (`src/commands/init.ts`)
    - Create `.vibeguard/` directory if missing
    - Write `config.json` with all documented defaults
    - Handle already-exists (exit 1 without --force)
    - Handle --force (overwrite)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [ ]* 2.4 Write property tests for Config Store
    - **Property 4: Config Schema Validation Rejects Invalid JSON**
    - **Validates: Requirements 3.3**
    - **Property 5: Glob Merge Correctness**
    - **Validates: Requirements 3.4**

  - [ ]* 2.5 Write unit tests for Init Command and Config Store
    - Test default config contains all required keys and values
    - Test already-exists error without --force
    - Test --force overwrites
    - Test config loading fallback to defaults
    - _Requirements: 2.1–2.9, 3.1–3.6_

- [ ] 3. Utilities: Git, Hash, Glob
  - [ ] 3.1 Implement Hash Utils (`src/utils/hash-utils.ts`)
    - `hashFile(path): Promise<string>` — SHA-256 via streaming for files > 1MB, buffer for smaller
    - `hashString(content): string` — SHA-256 of a string
    - _Requirements: 18.1_

  - [ ] 3.2 Implement Git Utils (`src/utils/git-utils.ts`)
    - `isGitRepo(cwd)`: check `.git` exists or `git rev-parse --git-dir` succeeds
    - `getCommitFrequency(file, sinceDays)`: parse `git log --since` output, return count
    - `getLastCommitDate(file)`: parse `git log -1 --format=%cI`
    - `isWorkingTreeClean(cwd)`: `git status --porcelain` is empty
    - `createBranch(name, cwd)`: `git checkout -b <name>`
    - `commitAll(message, cwd)`: `git add -A && git commit -m`
    - Safety: never execute `git push`, `git reset --hard`, `git clean -fdx`, or history-rewriting commands
    - _Requirements: 11.2, 11.3, 16.4, 16.6_

  - [ ] 3.3 Implement Glob Resolver (`src/utils/glob-resolver.ts`)
    - `resolveFiles(projectRoot, include, skipSet)`: walk directory tree, apply globs, skip symlinks outside root
    - Use `fs-extra` + minimatch or picomatch for glob matching
    - Return sorted list of relative file paths
    - _Requirements: 3.4, 3.5, 3.6_

  - [ ]* 3.4 Write property tests for Git Utils safety
    - **Property 38: Git Command Safety**
    - **Validates: Requirements 16.6**


- [ ] 4. Checkpoint - Phase 1 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: `npx vitest --run` passes, `npx tsc --noEmit` passes
  - CLI shell responds to --help, --version, unknown commands correctly

- [ ] 5. Graph Builder engine
  - [ ] 5.1 Implement Graph Builder (`src/engines/graph-builder.ts`)
    - Create ts-morph Project instance with tsconfig.json resolution
    - Parse each candidate file: extract imports (relative, alias, bare), exports (named, default)
    - Resolve relative imports and tsconfig path aliases to absolute project paths
    - Classify imports as internal (project file) or external (npm package)
    - Compute `dependents` as inverse of `imports` across all nodes
    - Implement concurrent processing with `p-limit` (worker count = min(cpus, 8))
    - Emit progress via Logger every 100 files when count > 500
    - _Requirements: 4.1, 4.5, 18.3, 18.4_

  - [ ] 5.2 Implement incremental rebuild logic
    - Load existing `analysis-meta.json` and compare stored hashes against current file hashes
    - If schema version mismatch or no existing graph: full rebuild
    - If schema matches: rebuild only nodes with changed hash or new files
    - After partial rebuild, update `dependents` for any node whose `imports` changed
    - Remove nodes for deleted files
    - Persist updated `graph.json` and `analysis-meta.json` with new hashes and timestamp
    - Record parse errors in `analysis-meta.json.parseErrors[]` and continue
    - _Requirements: 4.2, 4.3, 4.4, 4.8, 18.1, 18.5_

  - [ ] 5.3 Implement Map Command (`src/commands/map.ts`)
    - Load config, resolve globs to candidate files
    - Invoke Graph Builder
    - Emit JSON summary `{ nodes, edges, rebuilt, skipped, graphPath }` in JSON mode
    - Emit human-readable summary in terminal mode
    - _Requirements: 4.7_

  - [ ]* 5.4 Write property tests for Graph Builder
    - **Property 7: Graph Node Shape Invariant**
    - **Validates: Requirements 4.1**
    - **Property 8: Incremental Rebuild Correctness**
    - **Validates: Requirements 4.4, 18.1, 18.2**
    - **Property 9: Import Resolution Classification**
    - **Validates: Requirements 4.5**
    - **Property 10: Parse Error Resilience**
    - **Validates: Requirements 4.8**

  - [ ]* 5.5 Write property test for glob exclusion
    - **Property 6: Glob Exclusion Universality**
    - **Validates: Requirements 4.6, 5.7, 7.7**

- [ ] 6. Tagging Engine
  - [ ] 6.1 Implement Tagging Engine (`src/engines/tagging-engine.ts`)
    - Split camelCase and snake_case identifiers into individual words, emit as kebab-case lowercase
    - Split file path on separators, dots, hyphens into tag segments
    - Apply built-in framework patterns: `pages/api/**` → [api, route], `app/**` → [app-router, route], `routes/**` → [route], `components/**` → [component]
    - Parse `// @vibeguard: tag1, tag2` comments from file content
    - Apply `tags.customRules` from config (glob match → add tags)
    - Validate all tags match `^[a-z0-9-]+$`, sort alphabetically, deduplicate
    - Persist to `.vibeguard/tags.json` with schemaVersion
    - Implement incremental: skip files whose graph node is unchanged
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 18.2_

  - [ ]* 6.2 Write property tests for Tagging Engine
    - **Property 25: Tag Format Invariant**
    - **Validates: Requirements 10.6, 10.7**
    - **Property 26: Tag Derivation from Identifiers**
    - **Validates: Requirements 10.1**
    - **Property 27: Framework Pattern Tag Assignment**
    - **Validates: Requirements 10.3**

- [ ] 7. Importance Analyzer
  - [ ] 7.1 Implement Importance Analyzer (`src/engines/importance-analyzer.ts`)
    - Compute per-node: `(weights.dependents × node.dependents.length) + (weights.imports × node.imports.length) + (weights.git × gitCommits) + (weights.route × routeUsage)`
    - Derive `gitCommits` from Git Utils `getCommitFrequency(file, 90)`
    - If git unavailable: set gitCommits=0 for all, record warning in analysis-meta
    - Derive `routeUsage`: 1 if file matches route patterns, 0 otherwise
    - Read weights from config, fall back to defaults
    - Persist to `.vibeguard/importance.json` with schemaVersion
    - Implement incremental: skip files whose graph node and git count are unchanged
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 18.2_

  - [ ]* 7.2 Write property tests for Importance Analyzer
    - **Property 28: Importance Score Formula**
    - **Validates: Requirements 11.1**
    - **Property 29: Route Usage Classification**
    - **Validates: Requirements 11.4**


- [ ] 8. Checkpoint - Core engines complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: graph builder produces valid graph.json from test fixtures
  - Verify: tagging engine produces valid tags.json
  - Verify: importance analyzer produces valid importance.json

- [ ] 9. Security Scanner and Command
  - [ ] 9.1 Implement Security Scanner (`src/engines/security-scanner.ts`)
    - Implement `.env` + `.gitignore` gap detector (category: `secrets-gitignore`)
    - Implement hard-coded secret detectors: OpenAI keys, Anthropic keys, Google Gemini keys, AWS access key IDs/secrets, Firebase service account JSON, Supabase service_role keys, JWT secrets, Postgres/MySQL/MongoDB connection URLs
    - Implement framework misuse detectors: `cors({ origin: '*' })`, `app.use(cors())` without config, hard-coded `Access-Control-Allow-Origin: *`, disabled CSRF/auth outside test
    - Apply `security.customSecretPatterns` regex patterns from config
    - Emit issues with shape: `{ id, category, severity, message, file, line, column?, snippet?, suggestedFix? }`
    - Generate stable IDs: `SEC-<3-digit-detector>-<short-content-hash>`
    - Skip files in effective skip set; skip strings inside imports of test files
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ] 9.2 Implement Security Command (`src/commands/security.ts`)
    - Run Security Scanner, emit results (JSON or terminal)
    - Implement `--fix=gitignore`: append missing entries to .gitignore
    - Implement `--fix=env`: move secrets to .env, update .env.example, replace literals with `process.env.<NAME>` via ts-morph AST transform
    - Implement `--dry-run`: emit unified diffs, no writes
    - Implement `--git-safe`: check clean tree, create branch, commit after fix
    - Enforce 25-file limit for --fix=env without --force
    - Never modify files outside Project_Root
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 5.8_

  - [ ]* 9.3 Write property tests for Security Scanner
    - **Property 11: Secret Pattern Detection**
    - **Validates: Requirements 5.2, 5.4**
    - **Property 12: Security Issue ID Stability**
    - **Validates: Requirements 5.6**
    - **Property 13: Framework Misuse Detection**
    - **Validates: Requirements 5.3**

  - [ ]* 9.4 Write property tests for Security Command safety
    - **Property 14: Read-Only by Default**
    - **Validates: Requirements 6.1, 16.1**
    - **Property 16: Gitignore Fix Idempotence**
    - **Validates: Requirements 6.2**
    - **Property 18: Project Root Boundary Enforcement**
    - **Validates: Requirements 6.7**

- [ ] 10. Dead Code Scanner and Clean Command
  - [ ] 10.1 Implement Dead Code Scanner (`src/engines/dead-code-scanner.ts`)
    - Identify entrypoints from package.json (main, bin, exports), known files (src/index.ts, etc.), Next.js patterns (pages/, app/), configured entrypoint globs
    - Classify unused files: no path from any entrypoint in graph
    - Classify unused exports: no internal node imports by name, no wildcard re-export from entrypoint
    - Classify unused imports: imported binding not referenced in file body (via ts-morph)
    - Detect duplicate React components: compare JSX AST structure, prop signatures, identifier sets; report similarity score >= 0.85
    - Annotate candidates with importance, lastCommitDate (from Git Utils), testOnlyReferences
    - Skip files in effective skip set
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ] 10.2 Implement Clean Command (`src/commands/clean.ts`)
    - `--plan`: write `cleanup-plan.json` sorted by ascending importance
    - `--apply`: load plan, move file candidates to `.vibeguard-trash/<uuid>/` with meta.json
    - `--interactive`: batch candidates into groups of 10, prompt per batch
    - `--dry-run`: emit planned moves without writing
    - Enforce `clean.maxChangesPerRun` limit (default 50) without --force
    - `--git-safe`: require clean tree, create branch, commit
    - Emit JSON summary in JSON mode
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 7.8_

  - [ ]* 10.3 Write property tests for Dead Code Scanner
    - **Property 19: Dead Code Reachability**
    - **Validates: Requirements 7.2**
    - **Property 20: Unused Export Detection**
    - **Validates: Requirements 7.3**
    - **Property 21: Duplicate Component Similarity Threshold**
    - **Validates: Requirements 7.5**

  - [ ]* 10.4 Write property tests for Clean Command
    - **Property 22: Cleanup Plan Sort Order**
    - **Validates: Requirements 8.1**
    - **Property 15: Dry-Run Immutability**
    - **Validates: Requirements 6.4, 8.6, 16.2**


- [ ] 11. Checkpoint - Scanners and Clean complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: security scanner detects test fixture secrets and framework misuse
  - Verify: dead code scanner identifies unreachable files in test fixtures
  - Verify: clean --plan produces sorted cleanup-plan.json

- [ ] 12. Context Engine and Pack Command
  - [ ] 12.1 Implement Cost Estimator (`src/engines/cost-estimator.ts`)
    - Accept list of file paths, compute per-file token estimates
    - Use `lines × language_avg_tokens_per_line` for known extensions, `chars / 4` otherwise
    - Convert to per-model tokens using `tokensPerKiloChar` from config
    - Convert per-model tokens to USD using `pricePer1K`
    - Return `{ tokens, range: { low: 0.8*tokens, high: 1.2*tokens }, perModel }`
    - Use streamed line counting for files > 1MB
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ] 12.2 Implement Context Radius Engine (`src/engines/context-radius-engine.ts`)
    - Normalize task text: lowercase, remove English stopwords, apply Porter-like stemming
    - Match normalized tokens against tags.json, compute `match_score = sum(token_match_weight) × importance`
    - Produce seed set ranked by match_score
    - Expand seed set by `radius - 1` hops in both directions (imports + dependents), decay rank by 0.5 per hop
    - Apply mode multipliers: `feature` boosts route/component tags, `bugfix` boosts high recent commits, `refactor` boosts high fan-in
    - Apply budget constraint: add files in descending rank until cost exceeds budget, drop last
    - Order of operations: radius first, then budget
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [ ] 12.3 Implement Context Package Generator (`src/engines/context-package-generator.ts`)
    - Write `.vibeguard/context-package.md` with sections: Task, Detected Stack, Relevant Files, Warnings, Token Budget
    - Detect stack from package.json dependencies and config files
    - Include warnings for files with fan-in > 10 or critical security issues
    - Compute reduction percentage vs including all candidates
    - Write `.vibeguard/context-package.json` with equivalent machine-readable data
    - _Requirements: 14.7, 14.8_

  - [ ] 12.4 Implement Pack Command (`src/commands/pack.ts`)
    - Accept `<task>` positional arg or `--task-file <path>`
    - Accept `--radius N`, `--budget T`, `--mode feature|bugfix|refactor`
    - Ensure graph, tags, importance exist (trigger rebuild if stale)
    - Invoke Context Radius Engine → Context Package Generator
    - Emit JSON result in JSON mode: `{ selectedFiles, tokenEstimates, costEstimates, packagePaths }`
    - Handle no-match: empty selectedFiles, warnings includes "no-match", exit 0
    - _Requirements: 14.9, 14.10_

  - [ ]* 12.5 Write property tests for Cost Estimator
    - **Property 32: Cost Estimation Formula**
    - **Validates: Requirements 13.2, 13.3, 13.4**

  - [ ]* 12.6 Write property tests for Context Radius Engine
    - **Property 33: Task Normalization**
    - **Validates: Requirements 14.1**
    - **Property 34: Context Radius Expansion with Decay**
    - **Validates: Requirements 14.3**
    - **Property 35: Budget Constraint**
    - **Validates: Requirements 14.4**
    - **Property 36: Radius-Then-Budget Order**
    - **Validates: Requirements 14.5**

- [ ] 13. Health Analyzer and Doctor Command
  - [ ] 13.1 Implement Health Analyzer (`src/engines/health-analyzer.ts`)
    - Run or read cached: Security Scanner, Dead Code Scanner, Graph Builder, Context Radius Engine
    - Compute `security` sub-score: 100 - penalty per issue (critical=-20, high=-10, medium=-5, low=-2)
    - Compute `deadCode` sub-score: 100 - (unusedFiles + unusedExports) scaled to project size
    - Compute `architecture` sub-score: 100 - penalties for cyclic SCCs, files > 500 lines, fan-in > 25
    - Compute `contextEfficiency` sub-score: ratio of avg context selection to total project size, scaled 0-100
    - Compute `projectHealth` as rounded weighted average (equal weights), clamped [0, 100]
    - Handle upstream failures: mark failed sub-score as null, add to warnings[]
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.8_

  - [ ] 13.2 Implement Doctor Command (`src/commands/doctor.ts`)
    - Invoke Health Analyzer
    - JSON mode: emit `{ summary: { projectHealth, security, deadCode, architecture, contextEfficiency }, issues, warnings }`
    - Terminal mode: render summary table with scores and issue counts per severity
    - _Requirements: 12.6, 12.7_

  - [ ]* 13.3 Write property tests for Health Analyzer
    - **Property 30: Health Score Bounds and Computation**
    - **Validates: Requirements 12.2, 12.3**
    - **Property 31: Architecture Score Derivation**
    - **Validates: Requirements 12.4**


- [ ] 14. Checkpoint - Context engine and Doctor complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: pack command produces context-package.md and .json from test fixtures
  - Verify: doctor command produces health scores from test fixtures

- [ ] 15. Trash Command and Safety Layer
  - [ ] 15.1 Implement Trash Store (`src/storage/trash-store.ts`)
    - `move(filePath, meta)`: generate UUID, create `.vibeguard-trash/<uuid>/`, copy file mirroring path, write meta.json, remove original
    - `list()`: read all `meta.json` files under `.vibeguard-trash/`
    - `restore(idOrPath, force)`: find entry, check target doesn't exist (or --force), move back, recreate parent dirs, remove trash entry
    - `purge()`: remove all contents of `.vibeguard-trash/`
    - _Requirements: 8.3, 8.4, 9.1, 9.2, 9.3, 9.4_

  - [ ] 15.2 Implement Trash Command (`src/commands/trash.ts`)
    - `trash list`: emit entries from Trash Store (JSON or table)
    - `trash restore <id|path>`: invoke Trash Store restore, handle conflict
    - `trash purge`: require `--yes` flag or interactive confirmation of literal "purge"
    - Handle empty `.vibeguard-trash/`: emit empty list, exit 0
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 15.3 Write property tests for Trash Store
    - **Property 23: Trash/Restore Round-Trip**
    - **Validates: Requirements 8.3, 9.2**
    - **Property 24: Trash Meta Shape**
    - **Validates: Requirements 8.4**

  - [ ]* 15.4 Write property test for no hard deletes
    - **Property 37: No Hard Deletes**
    - **Validates: Requirements 16.3**

- [ ] 16. Safety enforcement and JSON output validation
  - [ ] 16.1 Implement safety middleware (`src/utils/safety.ts`)
    - `enforceDryRun(ctx)`: wrap filesystem operations to no-op when --dry-run active, collect planned changes
    - `enforceGitSafe(ctx)`: check clean tree, create branch, commit after mutations
    - `enforceMaxFiles(ctx, count)`: check against `limits.maxFilesPerRun`, refuse without --force
    - `enforceProjectBoundary(path, projectRoot)`: reject paths outside project root
    - _Requirements: 16.1, 16.2, 16.4, 16.5_

  - [ ] 16.2 Implement JSON output wrapper (`src/utils/json-output.ts`)
    - Wrap every command result with `{ schemaVersion: "1.0.0", ...result }`
    - Ensure exactly one JSON document emitted to stdout (no trailing content)
    - Validate schemaVersion format matches `MAJOR.MINOR.PATCH`
    - _Requirements: 15.1, 15.2_

  - [ ]* 16.3 Write property tests for JSON output and safety
    - **Property 1: JSON Mode Output Integrity**
    - **Validates: Requirements 1.7, 15.1, 15.6, 17.4**
    - **Property 2: Unknown Token Error Reporting**
    - **Validates: Requirements 1.6**
    - **Property 3: Structured Error Shape in JSON Mode**
    - **Validates: Requirements 1.9**
    - **Property 39: Logger Level Filtering**
    - **Validates: Requirements 17.1**
    - **Property 40: Schema Version Staleness Triggers Rebuild**
    - **Validates: Requirements 18.5**

- [ ] 17. Programmatic API
  - [ ] 17.1 Implement programmatic API (`src/api.ts`)
    - Export `runCommand(name, args, options)`: invoke command handler with JSON mode forced, return parsed result
    - Export `generateContextForEditor(task, options)`: invoke pack logic, return ContextPackage object
    - Export `serializeContextPackageForAgent(pkg)`: render ContextPackage as markdown string
    - No remote AI calls, no credentials required
    - _Requirements: 15.3, 15.4_

- [ ] 18. Checkpoint - All features complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: all commands work end-to-end against test fixtures
  - Verify: trash round-trip works (clean --apply then trash restore)
  - Verify: --dry-run produces no mutations for all mutating commands
  - Verify: --json output is valid JSON with schemaVersion for all commands

- [ ] 19. Integration tests and documentation
  - [ ]* 19.1 Write integration tests against fixture projects
    - Create test fixtures: `simple-project/`, `nextjs-project/`, `monorepo-project/`
    - Test each command end-to-end: init, map, security, clean --plan, pack, doctor, trash list
    - Test --json output parses correctly for each command
    - Test --git-safe creates branch and commits
    - Test --dry-run produces no filesystem changes
    - _Requirements: 19.5_

  - [ ] 19.2 Write README.md
    - Document installation (npm install -g vibeguard)
    - Document every subcommand with usage examples
    - Document every global option
    - Include at least one JSON output example per subcommand
    - Document programmatic API usage
    - _Requirements: 19.4, 15.5_

- [ ] 20. Final checkpoint - Release ready
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: `npx tsc --noEmit` passes with zero errors
  - Verify: `npx vitest --run` passes all unit, property, and integration tests
  - Verify: `npm pack --dry-run` includes correct files
  - Verify: compiled output has shebang and is executable

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (40 properties total)
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout with vitest + fast-check for testing
