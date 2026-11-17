import type { Env, Stdio } from '@mesa/core';

/** Who a call forwarded over the Command socket runs as (ADR-0032): its caller's environment, folder and start. */
export type Caller = { env: Env; cwd: string; startedAt: Date };

/**
 * A call's exit code and streams (runCli's); `exec`, what its process then becomes, and
 * `ownProcess` when it was refused as one that serves (Command.serves).
 */
export type Reply = {
  code: number;
  stdout: string;
  stderr: string;
  exec?: string[];
  ownProcess?: true;
};

/** One CLI call: its argv and stdin, as its caller when one forwarded it, to its reply. */
export type RunOne = (
  argv: string[],
  stdin: string | (() => Promise<string>),
  caller?: Caller,
) => Promise<Reply>;

type Request = { id: number | null; args?: string[]; stdin: string };

/** A usage failure as the envelope a `--json` call prints, so the caller reads it like any other. */
export const refused = (message: string): Reply => ({
  code: 2,
  stdout: `${JSON.stringify({ ok: false, error: { code: 'usage', message } })}\n`,
  stderr: '',
});

/** A request line; `args` is missing when the line is no request, `id` null when it has none. */
function parseRequest(line: string): Request {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { id: null, stdin: '' };
  }
  if (typeof value !== 'object' || value === null) return { id: null, stdin: '' };
  const { id, args, stdin } = value as Record<string, unknown>;
  // A numbered request that is malformed is still answered under its id, so no caller waits on it.
  const known = typeof id === 'number' ? id : null;
  const valid =
    known !== null &&
    Array.isArray(args) &&
    args.every((arg) => typeof arg === 'string') &&
    (stdin === undefined || stdin === null || typeof stdin === 'string');
  return valid
    ? { id: known, args, stdin: (stdin as string | null | undefined) ?? '' }
    : { id: known, stdin: '' };
}

/**
 * Serves `mesa serve` (ADR-0030, the Command server): each stdin line `{"id","args","stdin"}`
 * runs as one CLI call, and its reply `{"id","code","stdout","stderr"}` is one stdout line when
 * the call ends, so calls overlap and answer in any order; the caller keeps ids unique. A line
 * that is no request is refused under its id, or id null when it has none; a command that serves
 * its own stdio is refused before it runs (runCli, Command.serves), since stdout is the replies'.
 * Ends when stdin ends and every call has answered.
 */
export async function serveCommands(io: Stdio, runOne: RunOne): Promise<void> {
  const reply = (id: number | null, out: Pick<Reply, 'code' | 'stdout' | 'stderr'>) =>
    io.write(`${JSON.stringify({ id, code: out.code, stdout: out.stdout, stderr: out.stderr })}\n`);
  const calls = new Set<Promise<void>>();
  for await (const line of io.lines) {
    if (!line.trim()) continue;
    const { id, args, stdin } = parseRequest(line);
    if (id === null || !args) {
      reply(id, refused('mesa serve: not a request line'));
      continue;
    }
    const call = runOne(args, stdin).then(
      (out) => reply(id, out),
      (error: unknown) =>
        reply(id, {
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
