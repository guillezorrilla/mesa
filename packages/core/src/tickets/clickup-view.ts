import { z } from 'zod';
import { MesaError } from '../lib/result.js';
import { type ClickupLocationKind, clickupLocationLink } from '../sources/clickup.js';

// A ClickUp ticket view as tickets.yaml keeps it (CONTEXT.md, Ticket view): the tasks of a List,
// of every List in a Folder or a Space, or of a saved ClickUp view, subtasks included, narrowed
// to the person's open tasks unless it says not.

const KINDS = ['list', 'folder', 'space', 'view'] as const satisfies readonly ClickupLocationKind[];
const ID = /^[\w-]+$/;

export const ClickupViewSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  provider: z.literal('clickup'),
  /** The Workspace (ClickUp's team) it is in. */
  workspace: z.string().regex(ID),
  /** What it follows: a List, every List in a Folder or Space, or a saved ClickUp view. */
  kind: z.enum(KINDS),
  /** The List's, Folder's, Space's or view's id. */
  id: z.string().regex(ID, 'a ClickUp id is letters, digits, dashes and underscores'),
  /** Its name in ClickUp, and where it is (Space / Folder), kept to show them. */
  title: z.string().optional(),
  path: z.string().optional(),
  /** A saved view's type, such as board. */
  viewType: z.string().optional(),
  /** Every assignee's tasks, not only the person's. */
  everyone: z.boolean().optional(),
  /** Closed tasks too. */
  showDone: z.boolean().optional(),
});
export type ClickupView = z.infer<typeof ClickupViewSchema>;

/**
 * What `mesa tickets views add --provider clickup` takes: exactly one of a List, a Folder, a
 * Space or a saved view, each by its link or its id; a bare id is in `workspace`, else in the one
 * Workspace the connection reaches.
 */
export type ClickupViewInput = Pick<ClickupView, 'name' | 'everyone' | 'showDone'> & {
  provider: 'clickup';
  workspace?: string;
} & Partial<Record<ClickupLocationKind, string>>;

/**
 * The one location `input` names, its Workspace from its link, else `workspace`, else `only` (the
 * one Workspace connected); a usage error when it names none or several, or a link of another kind.
 */
export async function clickupLocationOf(
  input: ClickupViewInput,
  only: () => Promise<string | undefined>,
): Promise<{ workspace: string; kind: ClickupLocationKind; id: string }> {
  const given = KINDS.filter((kind) => input[kind]?.trim());
  const [kind] = given;
  if (given.length !== 1 || !kind)
    throw new MesaError(
      'usage',
      'a ClickUp view follows one of --list, --folder, --space or --view (a link or an id)',
    );
  const text = input[kind]?.trim() ?? '';
  if (/^https?:/.test(text)) {
    const link = clickupLocationLink(new URL(text));
    if (!link)
      throw new MesaError('usage', `${text} is not a ClickUp List, Folder, Space or view link`);
    if (link.kind !== kind)
      throw new MesaError('usage', `${text} links a ${link.kind}, not a ${kind}`);
    return link;
  }
  if (!ID.test(text)) throw new MesaError('usage', `${text} is not a ClickUp ${kind} link or id`);
  const workspace = input.workspace?.trim() || (await only());
  if (!workspace)
    throw new MesaError(
      'usage',
      `ClickUp reaches several Workspaces: pass the ${kind}'s link, or --workspace`,
    );
  return { workspace, kind, id: text };
}

/**
 * `view` in a line, as the view switcher's second line shows it: where it is (a saved view's
 * type), then whose, and closed tasks when it lists them.
 */
export function describeClickupView(view: ClickupView): string {
  const where =
    view.kind === 'view'
      ? `${view.viewType ? `${view.viewType[0]?.toUpperCase()}${view.viewType.slice(1)} ` : ''}view`
      : view.kind === 'space'
        ? 'Space'
        : view.path || (view.kind === 'list' ? 'List' : 'Folder');
  return [
    where,
    ...(view.everyone ? [] : ['assigned to me']),
    ...(view.showDone ? ['closed too'] : []),
  ].join(', ');
}
