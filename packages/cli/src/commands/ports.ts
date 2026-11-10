import { defineCommand } from '../command.js';

export const ports = defineCommand({
  name: 'ports',
  summary:
    "List the local URLs sessions' dev servers printed in their windows, listening first, or one session's",
  args: ['session?'],
  example: 'mesa ports a1b2c3d4',
  run: async ({ mesa, args }) => {
    const found = await mesa.sessions.ports(args.session);
    const state = (listening: boolean | null) =>
      listening === null ? 'unknown' : listening ? 'listening' : 'closed';
    const text =
      found
        .map((url) => `${url.url}  ${state(url.listening)}  ${url.session} ${url.sessionName}`)
        .join('\n') || 'no session printed a local URL';
    return { data: { ports: found }, text };
  },
});
