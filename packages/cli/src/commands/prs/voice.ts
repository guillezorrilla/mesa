import { defineCommand } from '../../command.js';

/** `mesa prs voice`: the profile's Review voice, the one prs command about no PR. */
export const prsVoice = defineCommand({
  name: 'prs voice',
  summary:
    'Show your review voice: the profile file whose text review sessions follow when writing comments',
  example: 'mesa prs voice',
  run: async ({ mesa }) => {
    const data = mesa.prs.voice();
    return {
      data,
      text: data.text
        ? `${data.path}\n\n${data.text}`
        : `No review voice: create ${data.path} to set one`,
    };
  },
});
