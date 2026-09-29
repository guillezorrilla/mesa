import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const imagePreview = defineCommand({
  name: 'image preview',
  summary: 'Validate and preview an image for a selected Claude Code session',
  args: ['session', 'path'],
  example: 'mesa image preview a1b2c3d4 ./screenshot.png',
  run: ({ mesa, args }) => {
    const data = mesa.sessions.images.preview(args.session, args.path);
    return { data, text: `${data.name}: ${data.mime}, ${data.bytes} bytes` };
  },
});

export const imageSend = defineCommand({
  name: 'image send',
  summary: 'Send a previewed image path through the session guardrail',
  args: ['session', 'path'],
  flags: {
    revision: { type: 'string', required: true, description: 'Revision from image preview' },
    profile: { type: 'string', required: true, description: 'Profile from image preview' },
    note: { type: 'string', description: 'Message to send with the image' },
    yes: { type: 'boolean', description: 'Send past a guardrail ask after confirmation' },
    'no-from': { type: 'boolean', description: 'Send as a person, not another Mesa session' },
  },
  example: 'mesa image send a1b2c3d4 ./screenshot.png --revision <sha256> --profile default',
  run: async ({ mesa, args, flags, confirm }) => {
    const prompt = mesa.sessions.images.prompt(
      args.session,
      args.path,
      flags.revision,
      flags.profile,
      flags.note,
    );
    const recorded = await mesa.sessions.send(args.session, prompt, {
      yes: flags.yes,
      noFrom: flags['no-from'],
      confirm,
    });
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `sent ${recorded.result.chars} characters to ${args.session}`,
    });
  },
});
