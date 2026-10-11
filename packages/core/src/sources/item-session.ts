import { MesaError } from '../lib/result.js';
import { joinWarnings } from '../receipts/recorder.js';
import type { sessionsService } from '../sessions/service/index.js';
import type { ImportListRow, importService } from './import-service.js';
import { itemGoal } from './item-goal.js';
import { type TicketStart, ticketStartPrompt } from './ticket-start.js';

// A session started from an imported item (CONTEXT.md, Import): its goal built from the item,
// and the item kept on its record.

type Imports = ReturnType<typeof importService>;
type Open = ReturnType<typeof sessionsService>['sessions']['open'];

/** What `mesa open` takes: the start's own options, and the item it starts from, if any. */
export type ItemOpenOptions = Omit<NonNullable<Parameters<Open>[1]>, 'from'> & {
  /** The item: its id, or a link (or key) to it, imported first when it is not yet. */
  from?: string;
  /** Write notes when it is imported first; on by default. */
  notes?: boolean;
  /** `goal` is the whole goal (the app's edited one), not added after the item's. */
  exactGoal?: boolean;
  /** A Jira issue's goal is this Ticket start's prompt, `goal` after it. */
  kind?: TicketStart;
};

/**
 * Starts sessions from `item`s, through `open`. A Jira issue's goal opens with the ticket prompt
 * `ticketPrompt` names for its project (CONTEXT.md, Ticket prompt), or, started as a Ticket start,
 * is that start's prompt with the ticket prompt as its rules.
 */
export function itemSessions(
  item: Imports['item'],
  open: Open,
  ticketPrompt: (project: string, override?: string | null) => string | undefined = () => undefined,
) {
  /**
   * The goal for `found`, then `goal`. `override` is a Saved prompt's name, or null for none;
   * undefined takes the project's. With `kind`, a Jira issue's goal is that Ticket start's prompt,
   * the Saved prompt its rules; without, the Saved prompt opens the item's goal.
   */
  const goalFor = (
    project: string,
    found: ImportListRow,
    { goal, override, kind }: { goal?: string; override?: string | null; kind?: TicketStart } = {},
  ) => {
    const jira = found.source === 'jira';
    const prompt = jira ? ticketPrompt(project, override)?.trim() : undefined;
    if (jira && kind)
      return ticketStartPrompt(kind, {
        project,
        key: found.id,
        title: found.title,
        url: found.url,
        snapshot: found.snapshot,
        note: found.note,
        rules: prompt,
        extra: goal,
      });
    const base = itemGoal(found, goal);
    return prompt ? `${prompt}\n\n${base}` : base;
  };
  return {
    /**
     * The goal a session started from `from` gets, and the item, without starting it. `prompt`
     * names the Saved prompt a Jira issue's goal takes (null for none) over the project's; `kind`
     * makes it that Ticket start's prompt.
     */
    goal: async (project: string, from: string, prompt?: string | null, kind?: TicketStart) => {
      const { item: found } = await item(project, from);
      return {
        source: found.source,
        id: found.id,
        title: found.title,
        goal: goalFor(project, found, { override: prompt, kind }),
      };
    },
    /**
     * Starts a session on `project` (sessions.open), from the item `from` names when given,
     * importing it first when it is not yet. Its goal is the item's (itemGoal), then `goal`; the
     * record keeps the item's `source` and `id`, and a Write notes run that failed in that import
     * is a warning, the session started all the same. Every usage error comes before any import.
     */
    open: async (project: string | undefined, opts: ItemOpenOptions = {}) => {
      const { from, notes = true, exactGoal, goal, kind, ...start } = opts;
      if (from === undefined) {
        if (!notes || exactGoal || kind)
          throw new MesaError('usage', '--no-notes, --exact-goal and --as need --from');
        return open(project, { ...start, goal });
      }
      if (start.goalFile !== undefined) {
        throw new MesaError('usage', 'pass --from or --goal-file, not both');
      }
      if (project === undefined || start.general || start.terminal) {
        throw new MesaError(
          'usage',
          '--from needs a project, and cannot use --general or --terminal',
        );
      }
      const found = await item(project, from, { notes });
      const opened = await open(project, {
        ...start,
        goal: exactGoal ? goal : goalFor(project, found.item, { goal, kind }),
        from: { source: found.item.source, id: found.item.id },
      });
      const failed =
        found.notes && !found.notes.ok
          ? `notes not written for ${found.item.id} (${found.notes.reason})`
          : undefined;
      const warning = joinWarnings(opened.warning, failed);
      return { ...opened, ...(warning ? { warning } : {}) };
    },
  };
}
