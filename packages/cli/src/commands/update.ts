import { MesaError, UPDATE_CHANNELS, type UpdateChannel, type UpdateCheck } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

const describe = (found: UpdateCheck) =>
  [
    found.available
      ? `Mesa ${found.latest} is available (running ${found.current}, ${found.channel} channel).`
      : `Mesa ${found.current} is up to date on the ${found.channel} channel.`,
    ...(found.revoked ? [`This version is revoked: ${found.revoked.reason}`] : []),
  ].join('\n');

export const updateCheck = defineCommand({
  name: 'update check',
  summary: "Check the profile's update channel for a newer Mesa, and whether this one is revoked",
  example: 'mesa update check',
  run: async ({ mesa }) => {
    const data = await mesa.update.check();
    return { data, text: describe(data) };
  },
});

export const updateChannel = defineCommand({
  name: 'update channel',
  summary: 'Print the update channel, or follow stable or beta releases from the next check',
  args: ['channel?'],
  example: 'mesa update channel beta',
  run: ({ mesa, args }) => {
    if (args.channel === undefined) {
      const channel = mesa.update.channel.get();
      return { data: { channel }, text: channel };
    }
    if (!UPDATE_CHANNELS.includes(args.channel as UpdateChannel))
      throw new MesaError('usage', `channel must be one of ${UPDATE_CHANNELS.join(', ')}`);
    const channel = args.channel as UpdateChannel;
    return recordedOutput(mesa.update.channel.set(channel), {
      data: { channel },
      text: `Updates follow the ${channel} channel.`,
    });
  },
});

export const updateInstall = defineCommand({
  name: 'update install',
  summary:
    'Open Mesa.app (starting it if closed) to download, verify and offer the newer Mesa; Install there',
  example: 'mesa update install',
  run: async ({ mesa }) => {
    const data = await mesa.update.install();
    const text =
      data.outcome === 'handed-to-app'
        ? `Mesa ${data.latest} is available. ${data.app} downloads and verifies it, then offers it: choose Install there.`
        : `${describe(data)} Nothing to install. Every release is at ${data.page}`;
    return { data, text };
  },
});

export const updateRevoked = defineCommand({
  name: 'update revoked',
  summary: 'Print why this Mesa version is revoked, or null when it is not',
  example: 'mesa update revoked',
  run: async ({ mesa }) => {
    const data = (await mesa.update.revoked()) ?? null;
    return { data, text: data ? `Revoked: ${data.reason}` : 'This version is not revoked.' };
  },
});
