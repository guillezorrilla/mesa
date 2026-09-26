import { MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';

const size = (value: string, name: string) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10_000) {
    throw new MesaError('usage', `${name} must be a whole number from 1 to 10000`);
  }
  return n;
};

/** The app's terminal calls this after each fit, so the tmux window takes the view's size. */
export const resize = defineCommand({
  name: 'resize',
  summary: "Size a session's tmux window to <cols> x <rows>, then give the size back to tmux",
  args: ['session', 'cols', 'rows'],
  run: async ({ mesa, args }) => {
    const done = await mesa.sessions.resize(
      args.session,
      size(args.cols, 'cols'),
      size(args.rows, 'rows'),
    );
    return { data: done, text: `resized ${done.target} to ${done.cols}x${done.rows}` };
  },
});
