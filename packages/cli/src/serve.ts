import type { Stdio } from '@mesa/core';

/** One CLI call: its argv and stdin, to its exit code and streams (runCli's). */
export type RunOne = (
  argv: string[],
  stdin: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;

type Request = { id: number; args: string[]; stdin: string };

/** A request line, or undefined when it is not one. */
function parseRequest(line: string): Request | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const { id, args, stdin } = value as Record<string, unknown>;
  if (typeof id !== 'number' || !Array.isArray(args)) return undefined;
  if (!args.every((arg) => typeof arg === 'string')) return undefined;
  if (stdin !== undefined && stdin !== null && typeof stdin !== 'string') return undefined;
  return { id, args, stdin: stdin ?? '' };
}

/**
 * Serves `mesa serve` (ADR-0030, the Command server): each stdin line `{"id","args","stdin"}`
 * runs as one CLI call, and its reply `{"id","code","stdout","stderr"}` is one stdout line when
 * the call ends, so calls overlap and answer in any order. A line that is no request is answered
 * with id null. Ends when stdin ends and every call has answered.
 */
export async function serveCommands(io: Stdio, runOne: RunOne): Promise<void> {
  const reply = (id: number | null, out: { code: number; stdout: string; stderr: string }) =>
    io.write(`${JSON.stringify({ id, code: out.code, stdout: out.stdout, stderr: out.stderr })}\n`);
  const calls = new Set<Promise<void>>();
  for await (const line of io.lines) {
    if (!line.trim()) continue;
    const request = parseRequest(line);
    if (!request) {
      reply(null, { code: 2, stdout: '', stderr: 'mesa serve: not a request line\n' });
      continue;
    }
    const call = runOne(request.args, request.stdin).then(
      (out) => reply(request.id, out),
      (error: unknown) =>
        reply(request.id, {
          code: 1,
          stdout: '',
          stderr: `${error instanceof Error ? error.message : String(error)}\n`,
        }),
    );
    calls.add(call);
    void call.finally(() => calls.delete(call));
  }
  await Promise.all(calls);
}
