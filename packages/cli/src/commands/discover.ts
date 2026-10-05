import { counted, DISCOVERY_DAYS } from '@mesa/core';
import { defineCommand } from '../command.js';
import { wholeNumber } from '../guards.js';
import { bulkExit } from '../output/bulk.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

const daysFlag = {
  type: 'string',
  description: `How many days back to look, 1 to 365 (default: ${DISCOVERY_DAYS})`,
} as const;
const daysOf = (flag?: string) =>
  flag === undefined ? DISCOVERY_DAYS : wholeNumber(flag, '--days');

export const discover = defineCommand({
  name: 'discover',
  summary:
    'List the project folders, running sessions, and recent Claude Code and Codex conversations on this machine that no profile has',
  flags: { days: daysFlag },
  example: 'mesa discover --days 7',
  run: async ({ mesa, flags }) => {
    const days = daysOf(flags.days);
    const found = await mesa.sessions.discover(days);
    const text = [
      ...columns(
        found.projects.map((p) => [
          p.name,
          p.path,
          `${counted(p.conversations, 'conversation')}${p.live ? `, ${p.live} running` : ''}`,
          p.registered ? '(registered)' : '',
        ]),
      ),
      ...columns(found.live.map((s) => ['running', s.name ?? s.id, s.agent, s.cwd])),
      found.unplaced ? `${counted(found.unplaced, 'conversation')} in no project folder` : '',
      found.truncated ? `showing newest ${found.conversations.length} of ${found.total}` : '',
    ].filter(Boolean);
    return {
      data: found,
      text: text.length ? text.join('\n') : `nothing found in the last ${counted(days, 'day')}`,
    };
  },
});

export const discoverAdopt = defineCommand({
  name: 'discover adopt',
  summary:
    'Register a project folder unless registered, and adopt its recent native conversations as resumable sessions under their own names; exits 2 when any item failed',
  args: ['path'],
  flags: {
    days: daysFlag,
    live: {
      type: 'boolean',
      description: "Also adopt the folder's running sessions, reopening them in Mesa windows",
    },
  },
  example: 'mesa discover adopt ~/src/lantern-cove --live',
  run: async ({ mesa, args, flags }) => {
    const days = daysOf(flags.days);
    const recorded = await mesa.sessions.adoptDiscovered({
      path: args.path,
      days,
      live: flags.live,
    });
    const { project, registered, adopted, reopened, failed } = recorded.result;
    const summary = [
      registered ? 'registered' : '',
      `${counted(adopted.length, 'session')} adopted`,
      reopened.length ? `${reopened.length} reopened` : '',
      failed.length ? `${failed.length} failed` : '',
    ].filter(Boolean);
    const text = [
      `${project}: ${summary.join(', ')}`,
      ...[...adopted, ...reopened].flatMap((a) =>
        a.project ? [`adopted ${a.agentSessionId} into ${a.project}`] : [],
      ),
      ...failed.map((f) => `failed ${f.agentSessionId}: ${f.reason}`),
    ].join('\n');
    return {
      ...recordedOutput(recorded, { data: recorded.result, text }),
      code: bulkExit(failed.length > 0),
    };
  },
});
