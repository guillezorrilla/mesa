// What the phone sends to drive a plain terminal session (#1069): its live output, read often
// while its screen is open, and keys from the key row. A typed line goes as `send` (steer.ts),
// which the Mac types through `mesa type` for a terminal. rpc.ts joins these to the other calls.
import { z } from 'zod';
import { isTerminalKey } from '../../sessions/input/terminal-keys.js';
import type { PhoneCall } from './rpc.js';

/**
 * How many output lines the phone gets: by default, how many more each scroll to the top asks
 * for, and at most (orca's 5,000 lines of scrollback).
 */
export const OUTPUT_LINES = { first: 120, page: 500, most: 5000 };

export const terminalCalls = [
  /**
   * The last lines of the session's output log, as `mesa logs --tail` reads them: `lines` of them
   * (an older Mac sends its first 120), with their colours when `colour` (an older Mac sends none).
   */
  z.object({
    method: z.literal('output'),
    id: z.string(),
    lines: z.number().int().min(1).max(OUTPUT_LINES.most).optional(),
    colour: z.boolean().optional(),
  }),
  /** Keys pressed in order, by tmux name (Enter, Escape, Up, C-c), as `mesa keys` presses them. */
  z.object({
    method: z.literal('keys'),
    id: z.string(),
    keys: z.array(z.string().refine(isTerminalKey, 'not a key a terminal takes')).min(1).max(16),
  }),
] as const;

export const terminalResults = {
  /** `more`: the log holds older lines than these; an older Mac never says. */
  output: z.object({ lines: z.array(z.string()), more: z.boolean().default(false) }),
  keys: z.object({}),
};

const METHODS: readonly string[] = terminalCalls.map((call) => call.shape.method.value);

export const isTerminalCall = (
  call: PhoneCall,
): call is Extract<PhoneCall, { method: 'output' | 'keys' }> => METHODS.includes(call.method);
