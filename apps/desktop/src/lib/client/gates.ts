import type { Gate, OpenGate } from '@mesa/core';
import { command, commandWith } from './spec';

/** Decision gate commands (CONTEXT.md, Decision gate): the open ones, and a person resolving one. */
export const gatesCommands = {
  'gates.list': command<{ gates: OpenGate[] }>('gates'),
  // The app runs outside any Mesa window, so the person's resolve goes through.
  'gates.resolve': commandWith<{ id: string; option: string }, Gate>(({ id, option }) => [
    'gates',
    'resolve',
    id,
    '--',
    option,
  ]),
};
