import type { Runner, RunResult } from '../lib/process.js';

/** Stdout, or a function of the call's arguments returning stdout or a whole result. */
type Answer = string | ((args: string[]) => string | RunResult | Promise<string | RunResult>);

/**
 * Answers from `outputs` by binary name; names in `missing` are ENOENT, names in `slow` time out,
 * names in `failing` exit non-zero. Every call is recorded.
 */
export function scriptedRunner(
  outputs: Record<string, Answer> = {},
  opts: { missing?: string[]; slow?: string[]; failing?: string[] } = {},
) {
  const calls: { file: string; args: string[]; timeoutMs: number }[] = [];
  const run: Runner = async (file, args, timeoutMs) => {
    calls.push({ file, args, timeoutMs });
    if (opts.missing?.includes(file)) return { ok: false, reason: 'missing', detail: 'ENOENT' };
    if (opts.slow?.includes(file)) return { ok: false, reason: 'timeout', detail: 'killed' };
    if (opts.failing?.includes(file)) return { ok: false, reason: 'failed', detail: 'exit 1' };
    const answer = outputs[file] ?? '';
    const said = typeof answer === 'function' ? await answer(args) : answer;
    return typeof said === 'string' ? { ok: true, stdout: said } : said;
  };
  return { run, calls };
}
