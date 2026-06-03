import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GRAPH_SCHEMA_VERSION, type GraphData, type GraphNode } from './graph-builder.js';
import { generateHTMLGraph } from './html-graph-generator.js';
import { generateGraphReport } from './graph-report-generator.js';
import { LLMClient } from './llm-provider.js';
import type { LLMCredentials } from '../storage/credentials-store.js';

/**
 * The canonical instruction text describing exactly how to produce the
 * `.codescout/graph.json` dependency map. Shared by:
 *  - "Copy prompt for creating map" (paste into any coding agent with repo access)
 *  - "Generate map using LLM" (sent to the configured LLM)
 *
 * Encodes the precise output schema so any capable model returns a file CodeScout
 * can render into the same interactive graph.html as the offline builder.
 */
export function buildMapPrompt(fileList: string[]): string {
  const sample = fileList.slice(0, 400).join('\n');
  const more = fileList.length > 400 ? `\n…and ${fileList.length - 400} more files` : '';

  return `You are building a precise dependency map of this codebase for CodeScout.

GOAL
Produce a single JSON file at \`.codescout/graph.json\` that maps how every source
file connects to every other source file via imports/requires/includes.

HOW TO ANALYZE (per file, by language)
- TS/JS/JSX/TSX/MJS/CJS: \`import\`, \`export … from\`, \`require()\`, dynamic \`import()\`.
- CSS/SCSS: \`@import\`, \`url(...)\`.
- HTML: \`src\`, \`href\` to local files.
- Python: \`import x\`, \`from x import y\`.
- Go: \`import\` blocks. Java: \`import\`. C/C++: \`#include "local.h"\`.
- JSON/YAML config: \`main\`, \`types\`, \`extends\`, \`from\` references.
- Markdown: relative links to repo files.

PATH RESOLUTION (critical — resolve to REAL files in the list below)
- Relative: \`./x\`, \`../x\`.
- tsconfig/jsconfig aliases (read paths/baseUrl): \`@/*\`, \`@app/*\`, etc.
- Extensionless: try \`.ts .tsx .js .jsx .mjs .cjs .json .css\`.
- Folder imports: try \`index.ts/.tsx/.js\`.
- Ignore external packages (node_modules) — only edges between files that exist.

OUTPUT SCHEMA (return ONLY this JSON, no prose, no markdown fence)
{
  "schemaVersion": "${GRAPH_SCHEMA_VERSION}",
  "nodes": {
    "<relative/file/path>": {
      "file": "<relative/file/path>",
      "imports": ["<resolved file path it imports>", "..."],
      "exports": ["<exported symbol names>", "..."],
      "dependents": ["<files that import THIS file>", "..."],
      "edges": []
    }
  }
}

RULES
- Keys and all paths are project-relative with forward slashes ("src/app.ts").
- \`dependents\` MUST be the exact inverse of \`imports\` across the whole graph.
- Include every source file as a node, even files with zero imports.
- Do not invent files. Only use paths from the file list.
- Output must be valid JSON parseable by JSON.parse.

After writing \`.codescout/graph.json\`, run \`npx codescout-cli graph\` to render the
interactive HTML view from it.

PROJECT FILES (${fileList.length} total)
${sample}${more}`;
}

/**
 * Normalize a model-produced graph object into the strict GraphData shape:
 * fill missing arrays, force forward slashes, and rebuild `dependents` as the
 * true inverse of `imports` so the render is always consistent even if the
 * model got the inverse slightly wrong.
 */
export function normalizeLLMGraph(raw: unknown): GraphData {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const rawNodes = (typeof obj.nodes === 'object' && obj.nodes !== null ? obj.nodes : {}) as Record<string, unknown>;

  const nodes: Record<string, GraphNode> = {};
  for (const [key, value] of Object.entries(rawNodes)) {
    const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
    const file = key.replace(/\\/g, '/');
    nodes[file] = {
      file,
      imports: toStringArray(v.imports).map((s) => s.replace(/\\/g, '/')),
      exports: toStringArray(v.exports),
      dependents: [],
      edges: [],
    };
  }

  // Rebuild dependents as the authoritative inverse of imports.
  for (const node of Object.values(nodes)) {
    for (const imp of node.imports) {
      const target = nodes[imp];
      if (target && !target.dependents.includes(node.file)) {
        target.dependents.push(node.file);
      }
    }
  }

  return { schemaVersion: GRAPH_SCHEMA_VERSION, nodes, edges: [] };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string');
}

/** Extract the first balanced JSON object from a model response (handles fences/prose). */
export function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

export interface LLMMapResult {
  nodes: number;
  edges: number;
  graphPath: string;
  htmlPath: string;
}

/**
 * Generate the dependency map via the configured LLM: send the file list +
 * offline-extracted imports as a hint, ask for the normalized graph.json,
 * validate/normalize it, then write graph.json + render graph.html + report.
 * Throws a clear error when the model output can't be parsed.
 */
export async function generateMapViaLLM(
  projectRoot: string,
  fileList: string[],
  credentials: LLMCredentials,
): Promise<LLMMapResult> {
  const client = new LLMClient(credentials);
  const prompt = buildMapPrompt(fileList);

  const response = await client.complete({
    messages: [
      { role: 'system', content: 'You are a precise static-analysis engine. Return only valid JSON in the requested schema. No prose.' },
      { role: 'user', content: prompt },
    ],
    maxTokens: 8000,
    temperature: 0,
  });

  const jsonText = extractJsonObject(response.content);
  if (!jsonText) {
    throw new Error('The model did not return parseable JSON. Try the offline map, or the copy-prompt option.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('The model returned malformed JSON. Try the offline map, or the copy-prompt option.');
  }

  const graphData = normalizeLLMGraph(parsed);
  const graphPath = join(projectRoot, '.codescout', 'graph.json');
  await writeFile(graphPath, JSON.stringify(graphData, null, 2) + '\n', 'utf-8');

  const htmlPath = await generateHTMLGraph(projectRoot, graphData);
  await generateGraphReport(projectRoot, graphData);

  let edgeCount = 0;
  for (const node of Object.values(graphData.nodes)) edgeCount += node.imports.length;

  return {
    nodes: Object.keys(graphData.nodes).length,
    edges: edgeCount,
    graphPath,
    htmlPath,
  };
}
