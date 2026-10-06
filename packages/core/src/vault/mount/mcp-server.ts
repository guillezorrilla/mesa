// A Model Context Protocol server on stdio, hand-rolled (docs/spikes/vault-mcp.md, ADR-0011):
// newline-delimited JSON-RPC 2.0. Only JSON-RPC goes to stdout; diagnostics go to stderr.

/** One tool as `tools/list` describes it. */
export type McpTool = { name: string; description: string; inputSchema: Record<string, unknown> };

/** A `tools/call` result: its text, and whether that text is the tool's error. */
export type McpToolResult = { content: { type: 'text'; text: string }[]; isError: boolean };

/** A tool's text answer, or with `isError` its error, which the agent reads as the call's outcome. */
export const toolText = (text: string, isError = false): McpToolResult => ({
  content: [{ type: 'text', text }],
  isError,
});

/** What a server serves. Every request asks again, so the answers may change while it runs. */
export type McpHandlers = {
  tools: () => McpTool[];
  /** The call's result, or undefined when there is no tool of that name. */
  call: (name: string, args: unknown) => Promise<McpToolResult | undefined>;
};

/** The streams a server runs on: stdin's lines, stdout, and stderr. */
export type Stdio = {
  lines: AsyncIterable<string>;
  write: (text: string) => void;
  log: (text: string) => void;
};

/** The protocol versions it speaks, newest first: a client asking for another gets the newest. */
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const CODES = { parse: -32700, request: -32600, method: -32601, params: -32602, internal: -32603 };

type Id = string | number | null;

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function answer(
  method: string,
  params: Record<string, unknown>,
  info: { name: string; version: string },
  handlers: McpHandlers,
): Promise<unknown> {
  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      const protocolVersion = VERSIONS.find((v) => v === asked) ?? VERSIONS[0];
      return { protocolVersion, capabilities: { tools: {} }, serverInfo: info };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: handlers.tools() };
    case 'tools/call': {
      const { name } = params;
      if (typeof name !== 'string') throw new RpcError(CODES.params, 'tools/call needs a name');
      const result = await handlers.call(name, params.arguments ?? {});
      if (!result) throw new RpcError(CODES.params, `Unknown tool: ${name}`);
      return result;
    }
    default:
      // Antigravity asks `server/discover` first and falls back to `initialize` on this error.
      throw new RpcError(CODES.method, `Method not found: ${method}`);
  }
}

/**
 * Answers each request line on `io` until its input ends, one at a time and in order. A
 * notification (no `id`) is never answered; unknown params (Claude's `_meta`) are ignored.
 */
export async function serveMcp(
  io: Stdio,
  info: { name: string; version: string },
  handlers: McpHandlers,
): Promise<void> {
  const reply = (
    id: Id,
    body: { result: unknown } | { error: { code: number; message: string } },
  ) => io.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...body })}\n`);
  for await (const line of io.lines) {
    if (!line.trim()) continue;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      reply(null, { error: { code: CODES.parse, message: 'Parse error' } });
      continue;
    }
    const invalid = { error: { code: CODES.request, message: 'Invalid request' } };
    if (
      !isObject(message) ||
      message.jsonrpc !== '2.0' ||
      typeof message.method !== 'string' ||
      ('id' in message &&
        typeof message.id !== 'string' &&
        (typeof message.id !== 'number' || !Number.isFinite(message.id)))
    ) {
      reply(null, invalid);
      continue;
    }
    if (!('id' in message)) continue;
    const id = message.id as string | number;
    try {
      const params = isObject(message.params) ? message.params : {};
      reply(id, { result: await answer(message.method, params, info, handlers) });
    } catch (error) {
      if (error instanceof RpcError) {
        reply(id, { error: { code: error.code, message: error.message } });
        continue;
      }
      const said = error instanceof Error ? error.message : String(error);
      io.log(`${info.name}: ${message.method} failed: ${said}\n`);
      reply(id, { error: { code: CODES.internal, message: said } });
    }
  }
}
