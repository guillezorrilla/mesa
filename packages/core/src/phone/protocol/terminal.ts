// What the phone sends to drive a plain terminal session (#1069): its live output, read often
// while its screen is open, and keys from the key row. A typed line goes as `send` (steer.ts),
// which the Mac types through `mesa type` for a terminal. rpc.ts joins these to the other calls.
import { z } from 'zod';
import { isTerminalKey } from '../../sessions/input/terminal-keys.js';
import type { PhoneCall } from './rpc.js';

export const terminalCalls = [
  /** The last lines of the session's output log, as `mesa logs --tail` reads them. */
  z.object({ method: z.literal('output'), id: z.string() }),
  /** Keys pressed in order, by tmux name (Enter, Escape, Up, C-c), as `mesa keys` presses them. */
  z.object({
    method: z.literal('keys'),
    id: z.string(),
    keys: z.array(z.string().refine(isTerminalKey, 'not a key a terminal takes')).min(1).max(16),
  }),
] as const;

export const terminalResults = {
  output: z.object({ lines: z.array(z.string()) }),
  keys: z.object({}),
};

const METHODS: readonly string[] = terminalCalls.map((call) => call.shape.method.value);

export const isTerminalCall = (
  call: PhoneCall,
): call is Extract<PhoneCall, { method: 'output' | 'keys' }> => METHODS.includes(call.method);
