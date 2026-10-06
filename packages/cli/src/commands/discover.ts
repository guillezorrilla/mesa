import { counted, DISCOVERY_DAYS, type DiscoveryAdoption, MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';
import { wholeNumber } from '../input/flags.js';
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
      ...columns(found.live.map((s) => ['running', s.name ?? s.prompt ?? s.id, s.agent, s.cwd])),
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
    'Register project folders unless registered, and adopt their recent native conversations as resumable sessions under their own names, over one scan; with several paths --json prints {items}, one per folder; exits 2 when any item failed',
  args: ['path', 'more...'],
  flags: {
    days: { ...daysFlag, description: `${daysFlag.description}; not with --ids` },
    live: {
      type: 'boolean',
      description: "Also adopt the folders' running sessions, reopening them in Mesa windows",
    },
    ids: {
      type: 'string',
      description:
        'Adopt exactly these conversations of the one folder, comma separated, without scanning (from mesa discover)',
    },
  },
  example:
    'mesa discover adopt ~/src/lantern-cove --ids 5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f --live',
  run: async ({ mesa, args, flags }) => {
    const ids = flags.ids?.split(',').filter(Boolean);
    if (ids && args.more.length > 0) throw new MesaError('usage', '--ids takes one path');
    if (ids && flags.days !== undefined)
      throw new MesaError('usage', '--ids adopts those conversations without a scan: drop --days');
    const days = daysOf(flags.days);
    if (args.more.length > 0) {
      const recorded = await mesa.sessions.adoptDiscoveredEach({
        paths: [args.path, ...args.more],
        days,
        live: flags.live,
      });
      const { items } = recorded.result;
      return {
        ...recordedOutput(recorded, {
          data: recorded.result,
          text: items.map(adoptionText).join('\n'),
        }),
        code: bulkExit(items.some((i) => i.failed.length > 0)),
      };
    }
    const recorded = await mesa.sessions.adoptDiscovered({
      path: args.path,
      days,
      live: flags.live,
      ...(ids && { ids }),
    });
    return {
      ...recordedOutput(recorded, { data: recorded.result, text: adoptionText(recorded.result) }),
      code: bulkExit(recorded.result.failed.length > 0),
    };
  },
});

/** One folder's adoption: its counts, conversations adopted into another project, failures. */
function adoptionText({ project, registered, adopted, reopened, failed }: DiscoveryAdoption) {
  const summary = [
    registered ? 'registered' : '',
    `${counted(adopted.length, 'session')} adopted`,
    reopened.length ? `${reopened.length} reopened` : '',
    failed.length ? `${failed.length} failed` : '',
  ].filter(Boolean);
  return [
    `${project}: ${summary.join(', ')}`,
    ...[...adopted, ...reopened].flatMap((a) =>
      a.project ? [`adopted ${a.agentSessionId} into ${a.project}`] : [],
    ),
    ...failed.map((f) => `failed ${f.agentSessionId}: ${f.reason}`),
  ].join('\n');
}
