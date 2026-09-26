import { defineCommand } from '../command.js';
import { wholeNumber } from '../guards.js';

/** The app's terminal calls this after each fit, so the tmux window takes the view's size. */
export const resize = defineCommand({
  name: 'resize',
  summary: "Size a session's tmux window to <cols> x <rows>, then give the size back to tmux",
  args: ['session', 'cols', 'rows'],
  example: 'mesa resize a1b2c3d4 120 40',
  run: async ({ mesa, args }) => {
    const done = await mesa.sessions.resize(
      args.session,
      wholeNumber(args.cols, 'cols'),
      wholeNumber(args.rows, 'rows'),
    );
    return { data: done, text: `resized ${done.target} to ${done.cols}x${done.rows}` };
  },
});
