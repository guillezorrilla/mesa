import type { Bridge } from '../client';
import { HEALTHY } from './healthy';

/** A bridge answering each mesa command (the words after --json), recording every call. */
export function fakeBridge(answers: Record<string, (args: string[]) => unknown> = {}) {
  const all = { ...HEALTHY, ...answers };
  const calls: string[][] = [];
  const bridge: Bridge = async (args) => {
    calls.push(args);
    // Longest command first (`git branch create`, `vault status`, then `doctor`).
    const answer =
      all[`${args[1]} ${args[2]} ${args[3]}`] ?? all[`${args[1]} ${args[2]}`] ?? all[args[1] ?? ''];
    if (!answer) throw new Error(`no fake answer for ${args.join(' ')}`);
    return answer(args);
  };
  return { bridge, calls };
}
