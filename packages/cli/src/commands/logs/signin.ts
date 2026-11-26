import { defineCommand } from '../../command.js';

export const logsLogin = defineCommand({
  name: 'logs login',
  summary:
    "Sign gcloud in for Cloud Logs: runs gcloud auth login, which opens the browser, and waits up to 3 minutes for you to finish (a person's, refused in a Mesa window)",
  example: 'mesa logs login',
  run: async ({ mesa }) => ({
    data: await mesa.logs.login(),
    text: 'Signed in to Google Cloud',
  }),
});

export const logsEnable = defineCommand({
  name: 'logs enable',
  summary:
    "Turn on the Error Reporting API in a configured GCP project, a change to that project (a person's, refused in a Mesa window)",
  args: ['project'],
  example: 'mesa logs enable tide-tables-123',
  run: async ({ mesa, args }) => {
    const done = await mesa.logs.enableErrorReporting(args.project);
    return { data: done, text: `Turned on Error Reporting in ${done.project}` };
  },
});
