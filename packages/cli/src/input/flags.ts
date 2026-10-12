import {
  MesaError,
  type ProviderId,
  providerName,
  providerOf,
  TERMINAL_APPS,
  TICKET_STARTS,
  type TicketStart,
  type ViewQuery,
} from '@mesa/core';

// What a command is given, checked and parsed into what core takes, before core sees it.

/** `tmux attach` needs a terminal on stdin; `instead` opens the terminal app on it. */
export function requireTty(tty: boolean, instead: string) {
  if (!tty) throw new MesaError('usage', `not a terminal: run this in one, or use ${instead}`);
}

/** What a command that shows tmux here takes to open the user's terminal app instead. */
export const APP_FLAG = {
  type: 'boolean',
  description: `Open it in the app config terminal.app names (${TERMINAL_APPS.join(', ')})`,
} as const;

/** What a command that works in a project's checkout takes to pick a linked worktree instead. */
export const CHECKOUT_FLAG = {
  type: 'string',
  description: 'Select a linked worktree path',
} as const;

/** What a command about one Mesa session's decision assistance takes to name it. */
export const SESSION_FLAG = {
  type: 'string',
  description: 'The Mesa session, from outside its window; inside one, only its own',
} as const;

/** A typed argument as a whole number; core checks its range. */
export function wholeNumber(value: string, name: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(n)) {
    throw new MesaError('usage', `${name} must be a whole number, not ${value}`);
  }
  return n;
}

/** A typed argument as a number; core checks its range. */
export function decimal(value: string, name: string): number {
  const n = Number(value);
  if (!value.trim() || !Number.isFinite(n)) {
    throw new MesaError('usage', `${name} must be a number, not ${value}`);
  }
  return n;
}

/** A typed `true` or `false` as a boolean. */
export function trueOrFalse(value: string, name: string): boolean {
  if (value !== 'true' && value !== 'false') {
    throw new MesaError('usage', `${name} must be true or false`);
  }
  return value === 'true';
}

/** A typed `up` or `down`, the way a list item moves. */
export function upOrDown(value: string, name: string): 'up' | 'down' {
  if (value !== 'up' && value !== 'down') {
    throw new MesaError('usage', `${name} must be up or down`);
  }
  return value;
}

/** `--as`: how a session from a Jira issue starts (CONTEXT.md, Ticket start). */
export const AS_FLAG = {
  type: 'string',
  description: `A Jira issue's goal is this Ticket start's prompt: ${TICKET_STARTS.join(', ')}`,
} as const;

/** `--as`'s value, checked; undefined when not given. */
export function ticketStartOf(value: string | undefined): TicketStart | undefined {
  if (value === undefined) return undefined;
  if (!(TICKET_STARTS as readonly string[]).includes(value))
    throw new MesaError('usage', `--as must be ${TICKET_STARTS.join(', ')}`);
  return value as TicketStart;
}

/** `--probability <option>=<p>` words as {option: p}; core checks each p is from 0 to 1. */
export function probabilitiesOf(words: string[]): Record<string, number> {
  const probabilities: Record<string, number> = {};
  for (const word of words) {
    const at = word.lastIndexOf('=');
    if (at <= 0) throw new MesaError('usage', `--probability takes <option>=<p>, not ${word}`);
    const option = word.slice(0, at);
    if (Object.hasOwn(probabilities, option)) {
      throw new MesaError('usage', `--probability names ${option} twice`);
    }
    probabilities[option] = decimal(word.slice(at + 1), `--probability ${option}`);
  }
  return probabilities;
}

/** `--search`: a Jira list narrowed to the names that hold it. */
export const SEARCH_FLAG = {
  type: 'string',
  description: 'Only those whose name holds this',
} as const;

/** The flags that name a view's query: `views add` and `preview` take them. */
export const VIEW_FLAGS = {
  provider: { type: 'string', description: 'jira (default), github, clickup or linear' },
  board: { type: 'string', description: "A board's id: the view reads its sprint" },
  sprint: { type: 'string', description: 'current (default) or next, with --board' },
  filter: { type: 'string', description: "A saved filter's id" },
  jql: { type: 'string', description: 'A JQL query' },
  repo: {
    type: 'string',
    description: "GitHub: the repo, owner/repo (default: --project's origin remote)",
  },
  project: { type: 'string', description: 'GitHub: the project whose origin remote is the repo' },
  label: { type: 'string', description: 'GitHub: issues with these labels, comma-separated' },
  milestone: { type: 'string', description: "GitHub: a milestone's title or number, or none" },
  list: { type: 'string', description: "ClickUp: a List's link or id" },
  folder: { type: 'string', description: "ClickUp: a Folder's link or id, for every List in it" },
  space: { type: 'string', description: "ClickUp: a Space's link or id, for every List in it" },
  view: { type: 'string', description: "ClickUp or Linear: a saved view's link or id" },
  workspace: {
    type: 'string',
    description: 'ClickUp: the Workspace of a bare id, when the connection reaches several',
  },
  team: { type: 'string', description: "Linear: a team's key or id: the view reads its cycle" },
  cycle: { type: 'string', description: 'Linear: current (default) or next, with --team' },
  'linear-project': { type: 'string', description: "Linear: a project's id, slug id or link" },
  everyone: { type: 'boolean', description: "Every assignee's tickets, not only yours" },
  'show-done': { type: 'boolean', description: 'Done (closed) tickets too' },
  site: { type: 'string', description: 'The Atlassian site, when the connection reaches several' },
} as const;

type ViewFlag = keyof typeof VIEW_FLAGS;
type ViewFlags = { [K in ViewFlag]?: string | boolean | undefined } & {
  everyone?: boolean | undefined;
  'show-done'?: boolean | undefined;
};
type Narrowing = { everyone?: true; showDone?: true };

/**
 * Each provider's own flags, and its view query from them (`text` reads a flag given as text);
 * the rest of VIEW_FLAGS are every provider's.
 */
const PROVIDER_VIEWS: {
  [K in ProviderId]: {
    flags: ViewFlag[];
    query: (text: (name: ViewFlag) => string | undefined, narrowing: Narrowing) => ViewQuery;
  };
} = {
  jira: {
    flags: ['board', 'sprint', 'filter', 'jql', 'site'],
    query: (text, narrowing) => {
      const board = text('board') === undefined ? undefined : Number(text('board'));
      if (board !== undefined && !(Number.isInteger(board) && board > 0))
        throw new MesaError('usage', '--board takes a board id; see mesa tickets boards');
      const sprint = text('sprint');
      if (sprint !== undefined && sprint !== 'current' && sprint !== 'next')
        throw new MesaError('usage', '--sprint is current or next');
      const [filter, jql, site] = [text('filter'), text('jql'), text('site')];
      return {
        ...(board !== undefined ? { board } : {}),
        ...(sprint ? { sprint: sprint as 'current' | 'next' } : {}),
        ...(filter !== undefined ? { filter } : {}),
        ...(jql !== undefined ? { jql } : {}),
        ...narrowing,
        ...(site ? { site } : {}),
      };
    },
  },
  github: {
    flags: ['repo', 'project', 'label', 'milestone'],
    query: (text, narrowing) => {
      const labels = text('label')
        ?.split(',')
        .map((l) => l.trim())
        .filter(Boolean);
      const [repo, project, milestone] = [text('repo'), text('project'), text('milestone')];
      return {
        provider: 'github',
        ...(repo ? { repo } : {}),
        ...(project ? { project } : {}),
        ...(labels?.length ? { labels } : {}),
        ...(milestone ? { milestone } : {}),
        ...narrowing,
      };
    },
  },
  clickup: {
    flags: ['list', 'folder', 'space', 'view', 'workspace'],
    query: (text, narrowing) => {
      const given = (['list', 'folder', 'space', 'view', 'workspace'] as const).flatMap((name) => {
        const value = text(name);
        return value ? [[name, value] as const] : [];
      });
      return { provider: 'clickup', ...Object.fromEntries(given), ...narrowing };
    },
  },
  linear: {
    flags: ['team', 'cycle', 'linear-project', 'view'],
    query: (text, narrowing) => {
      const cycle = text('cycle');
      if (cycle !== undefined && cycle !== 'current' && cycle !== 'next')
        throw new MesaError('usage', '--cycle is current or next');
      const [team, project, view] = [text('team'), text('linear-project'), text('view')];
      return {
        provider: 'linear',
        ...(team ? { team } : {}),
        ...(cycle ? { cycle: cycle as 'current' | 'next' } : {}),
        ...(project ? { project } : {}),
        ...(view ? { view } : {}),
        ...narrowing,
      };
    },
  },
};

/** The view query VIEW_FLAGS name, checked: Jira's, or another provider's with --provider. */
export function viewOf(flags: ViewFlags): ViewQuery {
  const text = (name: ViewFlag) => {
    const value = flags[name];
    return typeof value === 'string' ? value : undefined;
  };
  const provider = providerOf(text('provider') ?? 'jira');
  const mine: ViewFlag[] = PROVIDER_VIEWS[provider].flags;
  for (const [other, { flags: own }] of Object.entries(PROVIDER_VIEWS)) {
    // A flag two providers share (--view) is the given provider's.
    const given = own.filter(
      (name) => other !== provider && !mine.includes(name) && text(name) !== undefined,
    );
    if (given.length)
      throw new MesaError(
        'usage',
        `${given.map((n) => `--${n}`).join(', ')}: for ${providerName(providerOf(other))} views only`,
      );
  }
  return PROVIDER_VIEWS[provider].query(text, {
    ...(flags.everyone ? { everyone: true } : {}),
    ...(flags['show-done'] ? { showDone: true } : {}),
  });
}

/** `on` or `off`, as a boolean; undefined when not given. */
export const onOff = (flag: string, value?: string) => {
  if (value === undefined) return undefined;
  if (value !== 'on' && value !== 'off') throw new MesaError('usage', `--${flag} is on or off`);
  return value === 'on';
};
