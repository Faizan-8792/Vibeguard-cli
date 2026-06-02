import type { CommandContext } from '../context.js';
import { parseToolAllowlist } from '../mcp/tools.js';

export interface ServeCommandOptions {
  tools?: string;
}

/**
 * Start the VibeGuard MCP server on stdio.
 *
 * This is a long-running process: it speaks the Model Context Protocol over
 * stdin/stdout and must NOT write anything else to stdout (that would corrupt
 * the protocol stream). Status messages therefore go to stderr only.
 */
export async function runServe(ctx: CommandContext, opts: ServeCommandOptions): Promise<void> {
  const { startMcpServer } = await import('../mcp/server.js');
  const allow = parseToolAllowlist(opts.tools);

  // Diagnostic line on stderr (safe — stdout is reserved for the MCP stream).
  process.stderr.write(
    `[vibeguard] MCP server starting (project: ${ctx.projectRoot}${allow ? `, tools: ${allow.join(',')}` : ''})\n`,
  );

  await startMcpServer({
    projectRoot: ctx.projectRoot,
    allow,
    version: '0.1.0',
  });
}
