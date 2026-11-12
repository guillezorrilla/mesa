import { defineCommand } from '../command.js';

/** A session's pending prompt (CONTEXT.md, Pending prompt), as `mesa answer` takes it. */
export const prompt = defineCommand({
  name: 'prompt',
  summary:
    "Show the permission or question a waiting session's agent asks, with the options mesa answer takes",
  args: ['session'],
  example: 'mesa prompt a1b2c3d4',
  run: async ({ mesa, args }) => {
    const data = await mesa.sessions.prompt(args.session);
    if (data.status === 'unsupported') return { data, text: data.reason };
    const options = data.options.map((o) => `  ${o.id}: ${o.label}`);
    const typed = data.freeText ? ['  or a typed answer: --text "..."'] : [];
    // --prompt refuses the answer if another prompt has replaced this one meanwhile.
    const how = `answer: mesa answer ${data.session} <option> --prompt ${data.id}`;
    return {
      data,
      text: [`${data.kind} ${data.id}: ${data.summary}`, ...options, ...typed, how].join('\n'),
    };
  },
});
