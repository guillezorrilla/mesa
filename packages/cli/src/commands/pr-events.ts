import type { GhState } from '@mesa/core';
import { defineCommand } from '../command.js';

const ghLine = (gh: GhState) =>
  gh.state === 'ready'
    ? `gh: ready (${gh.version})`
    : gh.state === 'unauthenticated'
      ? 'gh: not logged in; run gh auth login'
      : gh.state === 'missing'
        ? 'gh: not installed'
        : `gh: unavailable (${gh.reason})`;

export const prEvents = defineCommand({
  name: 'pr-events',
  summary:
    "List new PR events (checks, reviews, comments) for live sessions' branches; --deliver forwards them into idle sessions",
  flags: {
    deliver: {
      type: 'boolean',
      description:
        'Send each idle session its pending events as one prompt with the PR link; busy sessions wait',
    },
  },
  example: 'mesa pr-events --deliver',
  run: async ({ mesa, flags }) => {
    if (flags.deliver) {
      const data = await mesa.prEvents.deliver();
      return {
        data,
        text: [
          ghLine(data.gh),
          ...data.deliveries.map(
            (d) =>
              `${d.session}: ${d.status} ${d.events.length} events${d.reason ? ` (${d.reason})` : ''}`,
          ),
          ...data.problems.map((p) => `${p.project}${p.pr ? ` #${p.pr}` : ''}: ${p.reason}`),
        ].join('\n'),
      };
    }
    const data = await mesa.prEvents.list();
    return {
      data,
      text: [
        `${ghLine(data.gh)}; forwarding ${data.enabled ? 'on' : 'off (sessions.prEvents)'}`,
        ...data.events.map((e) => `${e.session} #${e.pr.number} ${e.kind} ${e.at} ${e.url}`),
        ...data.problems.map((p) => `${p.project}${p.pr ? ` #${p.pr}` : ''}: ${p.reason}`),
      ].join('\n'),
    };
  },
});
