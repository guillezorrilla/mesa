import type { Stdio } from '../vault/mount/mcp-server.js';

// An MCP client in memory, for driving a stdio server (`mesa vault mcp`, `mesa decisions mcp`) as
// an agent drives it.

/** One reply line a server wrote. */
export type McpReply = {
  jsonrpc: string;
  id: number | string | null;
  result?: { content: { type: string; text: string }[]; isError: boolean } & Record<
    string,
    unknown
  >;
  error?: { code: number; message: string };
};

/** A JSON-RPC request line; with no `id`, a notification's. */
export const rpc = (id: number | undefined, method: string, params?: object) =>
  JSON.stringify({
    jsonrpc: '2.0',
    ...(id === undefined ? {} : { id }),
    method,
    ...(params ? { params } : {}),
  });

/** An `initialize` request, id 1, asking for `protocolVersion`. */
export const mcpInitialize = (protocolVersion = '2025-11-25') =>
  rpc(1, 'initialize', {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: 'a', version: '1' },
  });

/**
 * Runs `serve` on `input`, line by line; a function runs between the lines around it, once the
 * requests read so far are answered, as time passes between lines on a real pipe. Its replies,
 * each stdout line parsed (one that is not JSON-RPC 2.0 throws), and what it wrote on stderr.
 */
export async function driveMcp(
  serve: (io: Stdio) => Promise<void>,
  ...input: (string | (() => unknown))[]
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  async function* lines() {
    for (const line of input) {
      if (typeof line === 'string') yield line;
      else await new Promise((resolve) => setImmediate(resolve)).then(line);
    }
  }
  await serve({ lines: lines(), write: (t) => stdout.push(t), log: (t) => stderr.push(t) });
  const written = stdout.join('');
  if (written && !written.endsWith('\n')) throw new Error('driveMcp: stdout ends mid-line');
  const replies = written
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const reply = JSON.parse(line) as McpReply;
      if (reply.jsonrpc !== '2.0') throw new Error(`driveMcp: not JSON-RPC 2.0: ${line}`);
      return reply;
    });
  /** The reply to request `id`. */
  const reply = (id: number) => replies.find((r) => r.id === id);
  /** The text of the tool result answering `id`. */
  const text = (id: number) => reply(id)?.result?.content[0]?.text ?? '';
  return { replies, stderr: stderr.join(''), reply, text };
}
