import { LLMClient, type LLMMessage } from './llm-provider.js';
import type { LLMCredentials } from '../storage/credentials-store.js';
import type { GraphNode } from './graph-builder.js';

export interface AIFileSelection {
  files: string[];
  reasoning: string;
  tokensUsed: number;
}

const FILE_SELECTOR_PROMPT = `You are a code navigation expert. You receive a user's task/question and a list of project files with their tags and connections.

Your job: select the 3-12 most relevant files for this task. Be precise — select ONLY files that would actually help answer or implement the request.

Rules:
- Return STRICT JSON: { "files": ["path1", "path2", ...], "reasoning": "one sentence why" }
- Only return paths that exist in the provided file list
- Prefer files that are central to the task (high connectivity, matching tags)
- If the task is generic (e.g. "explain this project"), select key entrypoints and architecture files
- If the task mentions specific features/modules, target those
- Keep the selection minimal and focused — fewer files = lower cost
- Maximum 12 files, aim for 5-8`;

/**
 * Uses AI to select relevant files when local tag-matching returns no results.
 * This is the fallback for generic/casual prompts.
 * Only sends file names + tags (NOT file content) to keep token usage minimal.
 */
export async function selectFilesWithAI(
  task: string,
  credentials: LLMCredentials,
  graphNodes: Map<string, GraphNode>,
  tags: Record<string, string[]>,
): Promise<AIFileSelection> {
  // Build a compact file list with tags and connection counts (no content!)
  const fileList: string[] = [];
  for (const [path, node] of graphNodes) {
    const fileTags = tags[path] ?? [];
    const tagStr = fileTags.length > 0 ? ` [${fileTags.slice(0, 5).join(', ')}]` : '';
    const conns = `↑${node.dependents.length} ↓${node.imports.length}`;
    fileList.push(`${path}${tagStr} (${conns})`);
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: FILE_SELECTOR_PROMPT },
    { role: 'user', content: `Task: "${task}"\n\nProject files (${fileList.length}):\n${fileList.join('\n')}` },
  ];

  const client = new LLMClient(credentials);
  const response = await client.complete({ messages, maxTokens: 500, temperature: 0.1 });

  // Parse response
  let parsed: { files?: string[]; reasoning?: string };
  try {
    const json = extractJson(response.content);
    parsed = JSON.parse(json);
  } catch {
    parsed = { files: [], reasoning: 'Failed to parse AI response' };
  }

  // Validate that returned files actually exist in the graph
  const validFiles = (parsed.files ?? []).filter((f) => graphNodes.has(f));

  return {
    files: validFiles,
    reasoning: parsed.reasoning ?? 'AI-selected based on task context',
    tokensUsed: response.usage.totalTokens,
  };
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text.trim();
}
