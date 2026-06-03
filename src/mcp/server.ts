/**
 * CodeScout MCP server.
 *
 * Exposes the CodeScout engines as live Model Context Protocol tools over stdio,
 * so AI assistants (Claude, Cursor, Copilot, Kiro, etc.) can call them directly
 * instead of shelling out to `npx codescout-cli --json` and screen-scraping.
 *
 * Uses the low-level Server + setRequestHandler API (rather than the Zod-based
 * McpServer helper) to keep the tool contract a plain JSON schema that mirrors
 * our existing `--json` philosophy.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createTools, filterTools, type ToolDefinition } from './tools.js';

// Re-export the canonical tool-name list so consumers of the server module
// (tests, install scaffolding) have a single import surface for it.
export { TOOL_NAMES } from './tools.js';
export type { ToolName } from './tools.js';

/** Stable JSON contract version reported on every tool result. */
const SCHEMA_VERSION = '1.0.0';

export interface McpServerOptions {
  projectRoot: string;
  /** Optional allowlist of tool names to expose (token-constrained clients). */
  allow?: string[];
  /** Server version reported to clients. */
  version?: string;
}

/**
 * Build a configured (but not yet connected) MCP Server plus the resolved tool
 * set. Exposed separately from `startMcpServer` so tests can drive the handlers
 * without a real stdio transport.
 */
export function buildMcpServer(opts: McpServerOptions): { server: Server; tools: ToolDefinition[] } {
  const tools = filterTools(createTools(), opts.allow);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const server = new Server(
    { name: 'codescout', version: opts.version ?? '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = toolMap.get(name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      };
    }

    try {
      const result = await tool.run(args ?? {}, { projectRoot: opts.projectRoot });
      return {
        content: [{ type: 'text', text: JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...(result as object) }, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'TOOL_ERROR', message } }, null, 2) }],
      };
    }
  });

  return { server, tools };
}

/** Boot the MCP server on stdio. Resolves when the transport closes. */
export async function startMcpServer(opts: McpServerOptions): Promise<void> {
  const { server } = buildMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
