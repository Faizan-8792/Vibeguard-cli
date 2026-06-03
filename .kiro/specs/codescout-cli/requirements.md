# Requirements Document

## Introduction

CodeScout is a 100% local, open-source Node.js/TypeScript command-line tool that analyzes TypeScript and JavaScript projects to (1) reduce token costs for AI coding agents by generating focused context packages, (2) detect security issues such as exposed secrets and risky framework usage, (3) identify dead code and duplicate components, and (4) expose stable JSON output that can be invoked as a tool by external IDEs and AI agents (Copilot, Claude Code, Cursor, Windsurf, Kiro, MCP servers, VS Code extensions).

The MVP makes no external AI API calls and depends only on local static analysis (`typescript`, `ts-morph`), the local Git binary (read-only), and JSON files for storage. All mutating operations are opt-in, support `--dry-run`, and route deletions through a recoverable trash store rather than hard-deleting files.

## Glossary

- **CodeScout_CLI**: The top-level Node.js binary `codescout` exposed via `commander`, which routes invocations to subcommand handlers.
- **Doctor_Command**: The `codescout doctor` subcommand that aggregates findings into a Project Health Score.
- **Security_Command**: The `codescout security` subcommand that runs the Security_Scanner and applies opt-in fixes.
- **Clean_Command**: The `codescout clean` subcommand that detects dead code and stages cleanup actions.
- **Map_Command**: The `codescout map` subcommand that builds and persists the project dependency graph.
- **Pack_Command**: The `codescout pack` subcommand that produces a focused context package for a given task.
- **Trash_Command**: The `codescout trash` subcommand group (`list`, `restore`, `purge`) for managing soft-deleted artifacts.
- **Init_Command**: The `codescout init` subcommand that scaffolds the local configuration file.
- **Security_Scanner**: The module that detects exposed secrets, risky framework usage, and `.gitignore` gaps.
- **Dead_Code_Scanner**: The module that detects unused files, exports, functions, imports, components, and duplicate components.
- **Graph_Builder**: The module that produces and persists the project dependency graph using `ts-morph`.
- **Tagging_Engine**: The module that derives kebab-case tags for source files from identifiers, paths, framework patterns, and explicit `@codescout:` comments.
- **Importance_Analyzer**: The module that computes per-file importance scores from graph metrics and Git history.
- **Health_Analyzer**: The module that aggregates scanner and graph findings into Project Health sub-scores.
- **Cost_Estimator**: The module that estimates token counts and per-model costs for a given file set.
- **Context_Radius_Engine**: The module that selects a relevant subset of files for a task by tag matching and graph expansion.
- **Context_Package_Generator**: The module that renders selected files into `context-package.md` and `context-package.json`.
- **File_Store**: The persistence layer responsible for reading and writing artifacts under `.codescout/`.
- **Trash_Store**: The persistence layer responsible for soft-deleted artifacts under `.codescout-trash/`.
- **Config_Store**: The persistence layer responsible for `.codescout/config.json` defaults, overrides, and validation.
- **Logger**: The terminal output utility built on `chalk` and `ora` that is suppressed in JSON mode.
- **Git_Utils**: The read-only wrapper around the local `git` binary used for commit history and working-tree state.
- **Project_Root**: The directory containing the project being analyzed, identified as the first ancestor containing `package.json` or the user-specified `--cwd`.
- **JSON_Mode**: The output mode enabled by `--json`, in which the only writer to stdout is a single JSON document and the Logger writes nothing to stdout.
- **Dry_Run_Mode**: The mode enabled by `--dry-run`, in which planned mutations are reported but no files are written, moved, or deleted.
- **Context_Package**: The pair of artifacts `.codescout/context-package.md` and `.codescout/context-package.json` produced by Pack_Command.
- **Importance_Score**: A non-negative number computed as `(5 × dependents) + (2 × imports) + git_commit_frequency + route_usage`, with weights overridable via Config_Store.
- **Project_Health_Score**: An integer from 0 to 100 derived from sub-scores `security`, `deadCode`, `architecture`, and `contextEfficiency`.
- **Token_Budget**: A user-supplied or configured upper bound on the estimated tokens of a Context_Package.
- **Radius**: An integer hop count used by Context_Radius_Engine for graph expansion (`1` = direct dependencies/dependents only).
- **Severity**: One of `critical`, `high`, `medium`, `low`, `info`, applied to issues emitted by scanners.

## Requirements

### Requirement 1: CLI Entrypoint and Global Options

**User Story:** As a developer, I want a single `codescout` binary that exposes consistent global options across all subcommands, so that I can use the tool the same way in every project and from every AI agent.

#### Acceptance Criteria

1. THE CodeScout_CLI SHALL register the subcommands `doctor`, `security`, `clean`, `map`, `pack`, `trash`, and `init` using `commander`.
2. THE CodeScout_CLI SHALL accept the global options `--json`, `--cwd <path>`, `--include <glob...>`, `--exclude <glob...>`, `--config <path>`, `--verbose`, and `--quiet` for every subcommand.
3. WHEN the user invokes `codescout --help`, THE CodeScout_CLI SHALL print a usage summary listing every subcommand and every global option.
4. WHEN the user invokes `codescout --version`, THE CodeScout_CLI SHALL print the version declared in `package.json` and exit with status code 0.
5. WHEN no subcommand is provided, THE CodeScout_CLI SHALL print the usage summary and exit with status code 0.
6. IF an unknown subcommand or option is provided, THEN THE CodeScout_CLI SHALL print an error message naming the offending token and exit with status code 2.
7. WHILE JSON_Mode is active, THE Logger SHALL write nothing to stdout, and THE CodeScout_CLI SHALL emit exactly one JSON document to stdout terminated by a newline.
8. WHEN any subcommand completes successfully, THE CodeScout_CLI SHALL exit with status code 0.
9. IF any subcommand encounters a fatal error, THEN THE CodeScout_CLI SHALL emit a structured error object `{ "error": { "code": string, "message": string, "details": object? } }` on stdout in JSON_Mode or a single-line message on stderr otherwise, and exit with a non-zero status code.
10. THE CodeScout_CLI SHALL run on Node.js version 18 or higher on Windows, macOS, and Linux without requiring native compilation.

### Requirement 2: Project Initialization

**User Story:** As a developer onboarding CodeScout to a project, I want `codescout init` to scaffold a documented configuration file, so that I can configure ignores, tag rules, importance weights, security patterns, and model pricing without reading source code.

#### Acceptance Criteria

1. WHEN the user invokes `codescout init`, THE Init_Command SHALL create `.codescout/config.json` at Project_Root populated with documented default values.
2. THE default `.codescout/config.json` SHALL include the keys `ignore`, `tags.customRules`, `importance.weights`, `security.customSecretPatterns`, `context.defaultRadius`, `context.defaultTokenBudget`, and `context.models`.
3. THE default `ignore` array SHALL include the globs `node_modules/**`, `dist/**`, `build/**`, `coverage/**`, `**/*.test.ts`, `**/*.test.tsx`, `**/*.test.js`, `**/*.spec.ts`, `**/*.spec.tsx`, `**/*.spec.js`, `.codescout/**`, and `.codescout-trash/**`.
4. THE default `importance.weights` object SHALL set `dependents` to 5, `imports` to 2, `git` to 3, and `route` to 4.
5. THE default `context.defaultRadius` SHALL be 2 and the default `context.defaultTokenBudget` SHALL be 12000.
6. THE default `context.models` map SHALL contain at least one entry per supported family (e.g., `claude-3`, `gpt-4`) with the keys `tokensPerKiloChar` and `pricePer1K`.
7. IF `.codescout/config.json` already exists when `codescout init` is invoked without `--force`, THEN THE Init_Command SHALL leave the existing file unchanged and exit with status code 1 and an explanatory message.
8. WHEN `codescout init --force` is invoked, THE Init_Command SHALL overwrite the existing `.codescout/config.json` with the documented defaults.
9. WHEN the user invokes `codescout init`, THE Init_Command SHALL ensure that the directory `.codescout/` exists at Project_Root.

### Requirement 3: Configuration Loading and Globs

**User Story:** As a developer maintaining a large repository, I want every command to honor a single configuration file plus include and exclude globs, so that I can control which files are analyzed without editing source code.

#### Acceptance Criteria

1. WHEN any subcommand other than `init` runs, THE Config_Store SHALL load `.codescout/config.json` from Project_Root if it exists, or fall back to the documented defaults if it does not.
2. WHEN `--config <path>` is supplied, THE Config_Store SHALL load configuration from the supplied path instead of `.codescout/config.json`.
3. IF the configuration file is malformed JSON or violates the documented schema, THEN THE Config_Store SHALL emit a structured error identifying the offending key and exit with a non-zero status code.
4. THE Config_Store SHALL merge command-line `--include` and `--exclude` globs with the configured `ignore` list such that `--exclude` and `ignore` together form the effective skip set and `--include`, when supplied, restricts the candidate set to matching files.
5. WHEN no `--include` glob is supplied, THE Config_Store SHALL treat all `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, and `.cjs` files under Project_Root as candidates subject to the effective skip set.
6. THE Config_Store SHALL never traverse symbolic links pointing outside Project_Root.

### Requirement 4: Dependency Graph (`map`)

**User Story:** As a developer, I want `codescout map` to build a stored dependency graph of my project, so that downstream commands can reason about reachability, importance, and context expansion without re-parsing the codebase each time.

#### Acceptance Criteria

1. WHEN the user invokes `codescout map`, THE Graph_Builder SHALL produce a graph in which each node has the shape `{ "file": string, "imports": string[], "exports": string[], "dependents": string[] }`.
2. THE Graph_Builder SHALL persist the graph to `.codescout/graph.json` together with a sibling `.codescout/analysis-meta.json` recording the schema version, build timestamp, and the SHA-256 hash of every file included in the graph.
3. WHEN `.codescout/graph.json` does not exist or the recorded schema version does not match the current schema version, THE Graph_Builder SHALL perform a full rebuild.
4. WHEN `.codescout/graph.json` exists and the schema version matches, THE Graph_Builder SHALL rebuild only nodes whose source file content hash or modification time has changed since the last run, and SHALL update `dependents` for any node whose imports changed.
5. THE Graph_Builder SHALL resolve relative imports, path aliases declared in `tsconfig.json`, and bare-package imports, distinguishing internal nodes (resolvable to a Project_Root file) from external nodes (npm packages).
6. THE Graph_Builder SHALL exclude files that match the effective skip set from Requirement 3.
7. WHEN JSON_Mode is active, THE Map_Command SHALL emit `{ "summary": { "nodes": number, "edges": number, "rebuilt": number, "skipped": number }, "graphPath": string }` on stdout.
8. IF a source file fails to parse, THEN THE Graph_Builder SHALL record the failure in `analysis-meta.json` under `parseErrors[]` and continue processing the remaining files.

### Requirement 5: Security Scanner Detection

**User Story:** As a developer, I want `codescout security` to detect exposed secrets, missing `.gitignore` entries, and risky framework usage, so that I can find and remediate security issues before they are committed or deployed.

#### Acceptance Criteria

1. WHEN the user invokes `codescout security`, THE Security_Scanner SHALL detect that a `.env` file exists at Project_Root and is not covered by `.gitignore`, and SHALL emit an issue with category `secrets-gitignore`.
2. THE Security_Scanner SHALL detect hard-coded literals matching the documented signatures of OpenAI keys, Anthropic keys, Google Gemini keys, AWS access key IDs and secret access keys, Firebase service account JSON blobs, Supabase `service_role` keys, generic JWT secrets, and Postgres, MySQL, and MongoDB connection URLs.
3. THE Security_Scanner SHALL detect framework misuse patterns including `cors({ origin: '*' })`, `app.use(cors())` without configuration, hard-coded `Access-Control-Allow-Origin: *` headers, and Express middleware that disables CSRF or authentication when invoked outside `NODE_ENV === 'test'`.
4. THE Security_Scanner SHALL apply user-supplied regular expressions from `security.customSecretPatterns` in addition to its built-in detectors.
5. THE Security_Scanner SHALL emit issues with the shape `{ "id": string, "category": string, "severity": Severity, "message": string, "file": string, "line": number, "column": number?, "snippet": string?, "suggestedFix": string? }`.
6. THE Security_Scanner SHALL assign deterministic, stable issue IDs of the form `SEC-<3-digit-detector>-<short-content-hash>` so that the same finding receives the same ID across runs of the same code.
7. THE Security_Scanner SHALL skip files that match the effective skip set from Requirement 3, and SHALL skip strings inside imports of `*.test.*` and `*.spec.*` files.
8. WHEN JSON_Mode is active, THE Security_Command SHALL emit `{ "issues": Issue[], "counts": { "critical": number, "high": number, "medium": number, "low": number, "info": number } }` on stdout.

### Requirement 6: Security Auto-Fix Modes

**User Story:** As a developer, I want opt-in `--fix` modes that close common security gaps automatically, so that I can remediate findings without copy-pasting code.

#### Acceptance Criteria

1. THE Security_Command SHALL never modify any file in the working tree unless at least one of `--fix=gitignore`, `--fix=env`, `--apply`, or another explicit mutation flag is supplied.
2. WHEN `codescout security --fix=gitignore` is invoked, THE Security_Command SHALL ensure that `.gitignore` at Project_Root contains entries for `.env`, `.env.local`, `.codescout/`, and `.codescout-trash/`, appending only entries that are missing.
3. WHEN `codescout security --fix=env` is invoked, THE Security_Command SHALL move every detected hard-coded secret literal whose category is `hard-coded-secret` into a `.env` file at Project_Root, generate or update `.env.example` with placeholder values, and replace the literal in source with a `process.env.<NAME>` reference using a `ts-morph` AST transform.
4. WHEN `--dry-run` is supplied together with any `--fix` mode, THE Security_Command SHALL emit a unified diff per file that would be modified and SHALL NOT write to disk.
5. IF the number of files that would be modified by `--fix=env` exceeds 25, THEN THE Security_Command SHALL refuse to apply the fix unless `--force` is also supplied, emitting an explanatory error.
6. WHEN `--git-safe` is supplied together with any `--fix` mode, THE Security_Command SHALL require that `git status --porcelain` is empty, create a new branch named `codescout/security-fix-<timestamp>`, apply the fix on that branch, and commit the result with a descriptive message.
7. THE Security_Command SHALL never run a `--fix` operation on files outside Project_Root.

### Requirement 7: Dead Code Detection

**User Story:** As a developer cleaning a codebase, I want `codescout clean` to identify unused files, exports, functions, imports, and duplicate React components, so that I can remove dead weight without manually grepping the project.

#### Acceptance Criteria

1. THE Dead_Code_Scanner SHALL identify entrypoints by inspecting `package.json` `main`, `bin`, and `exports`, the files `src/index.ts`, `src/index.tsx`, `index.ts`, `index.tsx`, `index.js`, every file under `pages/` and `app/` for Next.js projects, and every file matched by configured `entrypoints` globs.
2. THE Dead_Code_Scanner SHALL classify a file as unused when no path from any entrypoint reaches the file in the dependency graph.
3. THE Dead_Code_Scanner SHALL classify an export as unused when no internal node imports the export by name and no entrypoint references it via wildcard re-export.
4. THE Dead_Code_Scanner SHALL classify an import as unused when the imported binding is not referenced in the file's body.
5. THE Dead_Code_Scanner SHALL identify duplicate or near-duplicate React components by comparing their JSX AST structure, prop signatures, and identifier sets, and SHALL report a similarity score between 0 and 1 for each pair flagged at or above 0.85.
6. THE Dead_Code_Scanner SHALL annotate each candidate with `importance` from Importance_Analyzer, `lastCommitDate` from Git_Utils, and `testOnlyReferences` (true when the only references come from files matching `**/*.{test,spec}.*`).
7. THE Dead_Code_Scanner SHALL skip files matched by the effective skip set from Requirement 3 when classifying candidates.
8. WHEN JSON_Mode is active, THE Clean_Command SHALL emit `{ "candidates": Candidate[], "summary": { "unusedFiles": number, "unusedExports": number, "unusedImports": number, "duplicateComponents": number } }` on stdout.

### Requirement 8: Cleanup Planning and Trash-Backed Apply

**User Story:** As a developer, I want `codescout clean` to produce a reviewable plan and to soft-delete files into a recoverable trash, so that I can clean my codebase without risking data loss.

#### Acceptance Criteria

1. WHEN `codescout clean --plan` is invoked, THE Clean_Command SHALL write `cleanup-plan.json` to `.codescout/` containing each candidate sorted by ascending Importance_Score, including `path`, `kind` (`file` | `export` | `import` | `duplicate-component`), `importance`, `lastCommitDate`, `testOnlyReferences`, and a stable `id`.
2. WHEN `codescout clean --apply` is invoked without `--plan`, THE Clean_Command SHALL load the most recent `.codescout/cleanup-plan.json` and apply only the items it contains.
3. WHEN applying a `file` candidate, THE Clean_Command SHALL move the file into `.codescout-trash/<uuid>/` mirroring its original path under that directory, and SHALL never invoke a hard-delete syscall.
4. THE Clean_Command SHALL write `meta.json` inside each `.codescout-trash/<uuid>/` entry with the keys `id`, `originalPath`, `movedAt`, `importance`, `lastCommitDate`, and `kind`.
5. WHEN `codescout clean --interactive` is invoked, THE Clean_Command SHALL group candidates into batches of at most 10 and prompt for confirmation per batch before applying.
6. WHEN `--dry-run` is supplied with `--apply`, THE Clean_Command SHALL print the list of moves and edits that would occur and SHALL NOT modify the working tree or the trash store.
7. IF the number of candidates that would be applied exceeds the configured `clean.maxChangesPerRun` (default 50), THEN THE Clean_Command SHALL refuse to apply unless `--force` is supplied.
8. WHEN `--git-safe` is supplied, THE Clean_Command SHALL require a clean working tree, create a branch named `codescout/clean-<timestamp>`, perform moves and edits there, and commit the result.

### Requirement 9: Trash Management

**User Story:** As a developer, I want to inspect, restore, and purge soft-deleted artifacts, so that mistakes from `codescout clean` are reversible.

#### Acceptance Criteria

1. WHEN the user invokes `codescout trash list`, THE Trash_Command SHALL emit one row per `.codescout-trash/<uuid>/meta.json` containing `id`, `originalPath`, `movedAt`, `kind`, and `importance`.
2. WHEN the user invokes `codescout trash restore <id|path>`, THE Trash_Command SHALL move the corresponding entry back to its `originalPath`, recreating any missing parent directories, and SHALL remove the now-empty `.codescout-trash/<uuid>/` directory.
3. IF restoring would overwrite an existing file at `originalPath`, THEN THE Trash_Command SHALL refuse the restore unless `--force` is supplied.
4. WHEN the user invokes `codescout trash purge`, THE Trash_Command SHALL require either an interactive confirmation prompt of the literal phrase `purge` or the flag `--yes`, and SHALL remove every entry under `.codescout-trash/` only after that confirmation.
5. IF `.codescout-trash/` does not exist, THEN `codescout trash list` SHALL emit an empty list and exit with status code 0.

### Requirement 10: Tagging Engine

**User Story:** As a developer, I want CodeScout to derive meaningful tags for every source file, so that `pack` can find files relevant to a task without me manually annotating them.

#### Acceptance Criteria

1. THE Tagging_Engine SHALL derive tags from each file's identifier names by splitting camelCase and snake_case into individual words and emitting each word in kebab-case lowercase.
2. THE Tagging_Engine SHALL derive tags from each file's directory and base name segments after splitting on path separators, dots, and hyphens.
3. THE Tagging_Engine SHALL apply built-in framework patterns so that files under `pages/api/**` receive `api` and `route`, files under `app/**` receive `app-router` and `route`, files under `routes/**` receive `route`, and files under `components/**` receive `component`.
4. THE Tagging_Engine SHALL parse `// @codescout: tag1, tag2` comments anywhere in a file and add the listed tags verbatim after kebab-case normalization.
5. THE Tagging_Engine SHALL apply user-supplied `tags.customRules` of the shape `{ "match": string, "add": string[] }` where `match` is interpreted as a glob relative to Project_Root.
6. THE Tagging_Engine SHALL persist its output to `.codescout/tags.json` as a map `{ [filePath: string]: string[] }` with tags sorted alphabetically and deduplicated.
7. THE Tagging_Engine SHALL never emit a tag containing whitespace, uppercase letters, or characters outside `[a-z0-9-]`.

### Requirement 11: Importance Analyzer

**User Story:** As a developer, I want CodeScout to score how important each file is to my project, so that cleanup and context-packing prioritize files I actually rely on.

#### Acceptance Criteria

1. THE Importance_Analyzer SHALL compute Importance_Score for every internal graph node as `(weights.dependents × dependents) + (weights.imports × imports) + (weights.git × git_commit_frequency) + (weights.route × route_usage)`.
2. THE Importance_Analyzer SHALL derive `git_commit_frequency` from `git log --since="90 days ago" --pretty=format: --name-only -- <file>` and SHALL normalize the count to a non-negative integer.
3. IF the Git binary is missing or Project_Root is not a Git repository, THEN THE Importance_Analyzer SHALL set `git_commit_frequency` to 0 for every file and SHALL record a single warning in `analysis-meta.json` under `warnings[]`.
4. THE Importance_Analyzer SHALL set `route_usage` to 1 when the file matches a known route pattern (`pages/**`, `app/**/page.{ts,tsx,js,jsx}`, `routes/**`, an Express `Router` registration site) and to 0 otherwise.
5. THE Importance_Analyzer SHALL read `weights.dependents`, `weights.imports`, `weights.git`, and `weights.route` from Config_Store, falling back to the documented defaults when missing.
6. THE Importance_Analyzer SHALL persist its output to `.codescout/importance.json` as a map `{ [filePath: string]: { score: number, dependents: number, imports: number, gitCommits: number, routeUsage: number } }`.

### Requirement 12: Health Analyzer (`doctor`)

**User Story:** As a developer, I want a single command that summarizes the health of my project, so that I can decide where to spend remediation effort.

#### Acceptance Criteria

1. WHEN the user invokes `codescout doctor`, THE Health_Analyzer SHALL run or read cached outputs from Security_Scanner, Dead_Code_Scanner, Graph_Builder, and Context_Radius_Engine before computing scores.
2. THE Health_Analyzer SHALL produce sub-scores `security`, `deadCode`, `architecture`, and `contextEfficiency`, each an integer from 0 to 100.
3. THE Health_Analyzer SHALL compute `Project_Health_Score` as the rounded weighted average of the four sub-scores using equal weights, clamped to the inclusive range 0 to 100.
4. THE Health_Analyzer SHALL derive `architecture` from graph metrics including the count of cyclic strongly connected components, the count of files exceeding 500 lines, and the count of nodes with fan-in exceeding 25.
5. THE Health_Analyzer SHALL derive `contextEfficiency` from the ratio of average Context_Package selection size to total project size weighted by Importance_Score, scaled into the 0-to-100 range.
6. WHEN JSON_Mode is active, THE Doctor_Command SHALL emit `{ "summary": { "projectHealth": number, "security": number, "deadCode": number, "architecture": number, "contextEfficiency": number }, "issues": Issue[] }` on stdout.
7. WHEN JSON_Mode is not active, THE Doctor_Command SHALL render a summary table with the five scores and a count of issues per Severity.
8. IF any upstream analyzer fails, THEN THE Doctor_Command SHALL still emit the available sub-scores, mark the failed sub-score as `null`, and include a `warnings[]` array describing each failure.

### Requirement 13: Cost Estimator

**User Story:** As a developer, I want CodeScout to estimate the token count and per-model cost of any selected file set, so that I can predict the price of an AI request before sending it.

#### Acceptance Criteria

1. THE Cost_Estimator SHALL accept a list of file paths and SHALL return an object containing `tokens` and `perModel`, where `perModel` is a map from model name to `{ "tokens": number, "usd": number }`.
2. THE Cost_Estimator SHALL compute `tokens` as the sum, for each file, of `lines × language_avg_tokens_per_line` when the file extension maps to a known language, and as `chars / 4` otherwise.
3. THE Cost_Estimator SHALL convert tokens to per-model token counts using `tokensPerKiloChar` from `context.models` and SHALL convert per-model tokens to USD using `pricePer1K`.
4. THE Cost_Estimator SHALL return both a point estimate and a `range` object `{ "low": number, "high": number }` for `tokens`, with `low` equal to 0.8 × point and `high` equal to 1.2 × point.
5. THE Cost_Estimator SHALL never block on file size and SHALL use streamed line counting for files larger than 1 MB.

### Requirement 14: Context Radius Engine and Pack Command

**User Story:** As a developer using an AI coding agent, I want `codescout pack <task>` to assemble a focused, importance-aware context package within a token budget, so that my agent receives only the files that matter for the task.

#### Acceptance Criteria

1. WHEN the user invokes `codescout pack <task>` or `codescout pack --task-file <path>`, THE Context_Radius_Engine SHALL normalize the task text by lowercasing, removing the documented English stopword list, and applying the documented Porter-like stemming rules.
2. THE Context_Radius_Engine SHALL match normalized task tokens against tags in `.codescout/tags.json` and SHALL produce a seed set of files ranked by `match_score = sum(token_match_weight) × Importance_Score`.
3. WHEN `--radius N` is supplied, THE Context_Radius_Engine SHALL expand the seed set by traversing the dependency graph for `N - 1` additional hops in both directions, adding each new node with rank decayed by 0.5 per hop.
4. WHEN `--budget T` is supplied, THE Context_Radius_Engine SHALL keep adding files in descending rank order until the Cost_Estimator's point estimate for the selected set first exceeds `T`, then drop the last-added file, and stop.
5. WHEN both `--radius` and `--budget` are supplied, THE Context_Radius_Engine SHALL apply the radius constraint first and the budget constraint second.
6. WHEN `--mode feature|bugfix|refactor` is supplied, THE Context_Radius_Engine SHALL apply documented mode-specific multipliers to seed weights (`feature` boosts route and component tags, `bugfix` boosts files with high recent commit frequency, `refactor` boosts files with high fan-in).
7. THE Context_Package_Generator SHALL write `.codescout/context-package.md` containing a `Task` section, a `Detected Stack` section inferred from `package.json` dependencies and config files, a `Relevant Files` section with one bullet per selected file (path, tags, importance, role, hop distance), a `Warnings` section listing any selected file with fan-in > 10 or marked critical by Security_Scanner, and a `Token Budget` section with point estimate, range, and reduction percentage versus including all candidate files.
8. THE Context_Package_Generator SHALL write `.codescout/context-package.json` containing the same data as the markdown package in machine-readable form.
9. WHEN JSON_Mode is active, THE Pack_Command SHALL emit `{ "selectedFiles": SelectedFile[], "tokenEstimates": object, "costEstimates": object, "packagePaths": { "md": string, "json": string } }` on stdout.
10. IF no files match the task tokens, THEN THE Pack_Command SHALL emit a `selectedFiles` array of length 0, set `warnings[]` to include `"no-match"`, and exit with status code 0.

### Requirement 15: JSON Output Stability and Agent Integration

**User Story:** As an AI agent or IDE extension author, I want every CodeScout JSON contract to be stable and self-describing, so that I can shell out to `codescout ... --json` and parse the result without screen-scraping.

#### Acceptance Criteria

1. WHILE JSON_Mode is active, every subcommand SHALL emit a single top-level JSON object whose first key is `schemaVersion` set to a string in the form `MAJOR.MINOR.PATCH`.
2. THE CodeScout_CLI SHALL increment the major component of `schemaVersion` whenever a JSON field is renamed, removed, or has its type changed.
3. THE CodeScout_CLI SHALL expose a thin, isolated programmatic API including at minimum `runCommand(name, args, options): Promise<Result>`, `generateContextForEditor(task, options): Promise<ContextPackage>`, and `serializeContextPackageForAgent(pkg): string`.
4. THE programmatic API SHALL not call any remote AI API and SHALL not require credentials of any AI provider.
5. THE CodeScout_CLI SHALL document every JSON contract in `README.md` with at least one example payload per subcommand.
6. WHEN JSON_Mode is active, THE Logger SHALL route all human-readable output to stderr at the configured verbosity level so that AI agents can consume stdout without interleaving.

### Requirement 16: Safety Guarantees

**User Story:** As a developer running CodeScout in CI or against a large repository, I want strong safety guarantees by default, so that the tool can never silently damage my project.

#### Acceptance Criteria

1. THE CodeScout_CLI SHALL be read-only by default, and no subcommand SHALL modify any file outside `.codescout/` and `.codescout-trash/` unless an explicit mutation flag (`--fix`, `--apply`, `--restore`, `--purge`, `--force`, or `--init --force`) is supplied.
2. THE CodeScout_CLI SHALL support `--dry-run` for every mutating subcommand and SHALL emit unified-diff output (or, in JSON_Mode, a structured `plannedChanges[]` array) describing every action that would be taken.
3. THE CodeScout_CLI SHALL never delete any source file with a hard-delete syscall; deletions SHALL always route through Trash_Store.
4. WHEN `--git-safe` is supplied to a mutating subcommand, THE CodeScout_CLI SHALL refuse to proceed unless `git status --porcelain` is empty, and SHALL perform mutations on a new branch `codescout/<command>-<timestamp>` committed by Git_Utils with a descriptive message.
5. THE Config_Store SHALL expose a `limits.maxFilesPerRun` setting (default 200) that caps the number of files any single mutating run may touch, and any subcommand SHALL refuse to exceed that limit unless `--force` is supplied.
6. THE Git_Utils SHALL invoke the local `git` binary in read-only mode for all operations except those explicitly required by `--git-safe`, and SHALL never run `git push`, `git reset --hard`, `git clean -fdx`, or any history-rewriting command.

### Requirement 17: Logging and Terminal UX

**User Story:** As a developer, I want clear, non-noisy output in the terminal and silent output in JSON mode, so that CodeScout fits into both interactive and machine workflows.

#### Acceptance Criteria

1. THE Logger SHALL provide the levels `error`, `warn`, `info`, `debug`, and SHALL respect `--quiet` (suppress info and debug) and `--verbose` (enable debug).
2. THE Logger SHALL use `chalk` for colorized output when stdout is a TTY and SHALL emit uncolored output when stdout is not a TTY or when `NO_COLOR` is set.
3. THE Logger SHALL use `ora` spinners only when stdout is a TTY and JSON_Mode is inactive, and SHALL gracefully suppress spinners in CI environments by detecting `CI=true`.
4. WHILE JSON_Mode is active, THE Logger SHALL never write to stdout and SHALL route every message to stderr at level `warn` or higher.
5. THE Logger SHALL prefix every message with the active subcommand name in non-JSON_Mode (e.g., `[security]`).

### Requirement 18: Performance and Incrementality

**User Story:** As a developer working in a large repository, I want CodeScout to finish quickly on subsequent runs, so that I can use it inside an interactive workflow.

#### Acceptance Criteria

1. THE Graph_Builder SHALL store per-file SHA-256 content hashes in `.codescout/analysis-meta.json` and SHALL skip re-parsing any file whose hash matches the stored hash.
2. THE Tagging_Engine and Importance_Analyzer SHALL skip recomputation for any file whose graph node was unchanged in the most recent build, reusing the persisted entry from `.codescout/tags.json` and `.codescout/importance.json`.
3. THE Graph_Builder SHALL process source files concurrently with a worker count equal to the lesser of the number of logical CPUs and 8.
4. WHEN the candidate file count exceeds 500, THE Graph_Builder SHALL emit a progress indicator via Logger every 100 processed files in non-JSON_Mode.
5. WHEN any subcommand reads a persisted artifact whose `schemaVersion` does not match the current schema, THE corresponding analyzer SHALL discard the artifact and rebuild it.

### Requirement 19: Packaging and Distribution

**User Story:** As a maintainer publishing CodeScout, I want a clean Node.js package layout with the documented commands, so that users can install it globally and AI agents can locate the binary deterministically.

#### Acceptance Criteria

1. THE `package.json` SHALL declare `"engines": { "node": ">=18" }`, a `bin` entry mapping `codescout` to the compiled CLI entrypoint, and a `files` array that excludes test sources and `.codescout*` runtime data.
2. THE `tsconfig.json` SHALL target `ES2022`, enable `strict`, and emit declaration files alongside JavaScript output.
3. THE compiled CLI entrypoint SHALL begin with a `#!/usr/bin/env node` shebang and SHALL be marked executable on POSIX systems via the publish pipeline.
4. THE repository SHALL include a `README.md` that documents installation, every subcommand, every global option, and at least one JSON output example per subcommand.
5. THE repository SHALL include automated test scaffolding using either `vitest` or `jest`, with at least one passing example test per scanner module and per command handler covered by Requirements 4 through 14.
