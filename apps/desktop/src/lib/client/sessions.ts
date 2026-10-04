import type {
  Agent,
  Attached,
  ConversationSearch,
  DescendantResult,
  EachResult,
  GridGroup,
  InstructionStatus,
  NativeDiscovery,
  NativeHistory,
  Removed,
  Sent,
  SessionImage,
  SessionLog,
  SessionRecord,
  StopOutcome,
  TreeRow,
} from '@mesa/core';
import { command, commandWith, type Recorded } from './spec';

/** The Board's commands: its sessions, their Grid groups, and images sent to one. */
export const sessionsCommands = {
  'grid.list': command<GridGroup[]>('grid'),
  'grid.save': commandWith<GridGroup, Recorded<{ groups: GridGroup[] }>>(
    ({ name, project, sessions }) => [
      'grid',
      'save',
      ...(project ? ['--project', project] : []),
      '--',
      name,
      ...sessions,
    ],
  ),
  'grid.remove': commandWith<{ name: string }, Recorded<{ groups: GridGroup[] }>>(({ name }) => [
    'grid',
    'remove',
    '--',
    name,
  ]),
  // The board as mesa orders it: attention, children under their parent.
  'sessions.list': command<TreeRow[]>('sessions', '--tree'),
  'image.preview': commandWith<{ id: string; path: string }, SessionImage>(({ id, path }) => [
    'image',
    'preview',
    '--',
    id,
    path,
  ]),
  'image.send': commandWith<
    { image: SessionImage; note: string; yes?: boolean },
    Recorded<Omit<Sent, 'project'>>
  >(({ image, note, yes }) => [
    'image',
    'send',
    '--no-from',
    '--revision',
    image.revision,
    '--profile',
    image.profile,
    ...(note ? [`--note=${note}`] : []),
    ...(yes ? ['--yes'] : []),
    '--',
    image.session,
    image.path,
  ]),
  'sessions.send': commandWith<
    { id: string; prompt: string; yes?: boolean },
    Recorded<Omit<Sent, 'project'>>
  >(
    // `--no-from`: a person typing here is not a session sending, even when the app itself was
    // started inside a Mesa window. `--yes` answers a guardrail's ask; the app never passes
    // `--force`, so a block is final here.
    ({ id, prompt, yes }) => ['send', '--no-from', ...(yes ? ['--yes'] : []), '--', id, prompt],
  ),
  'sessions.rename': commandWith<{ id: string; name: string }, Recorded<SessionRecord>>(
    ({ id, name }) => ['rename', '--', id, name],
  ),
  // The app removes an ended session only, so never with --force.
  'sessions.remove': commandWith<
    { id: string; force?: boolean; deleteWorktree?: boolean; deleteBranch?: boolean },
    Recorded<Removed>
  >(({ id, force, deleteWorktree, deleteBranch }) => [
    'rm',
    ...(force ? ['--force'] : []),
    ...(deleteWorktree ? ['--delete-worktree'] : []),
    ...(deleteBranch ? ['--delete-branch'] : []),
    '--',
    id,
  ]),
  'sessions.archive': commandWith<{ id: string }, Recorded<SessionRecord>>(({ id }) => [
    'archive',
    '--',
    id,
  ]),
  'sessions.archiveEach': commandWith<
    { ids: string[] },
    EachResult<SessionRecord & { warning?: string }>
  >(({ ids }) => ['archive', '--', ...ids]),
  'sessions.stop': commandWith<{ id: string }, Recorded<SessionRecord & { outcome: StopOutcome }>>(
    ({ id }) => ['stop', '--', id],
  ),
  'sessions.stopDescendants': commandWith<
    { id: string; expected: string[] },
    DescendantResult<{ outcome: StopOutcome; warning?: string }>
  >(({ id, expected }) => ['stop', '--descendants', `--expect=${expected.join(',')}`, '--', id]),
  'sessions.removeDescendants': commandWith<
    { id: string; expected: string[]; deleteWorktree?: boolean; deleteBranch?: boolean },
    DescendantResult<Removed & { warning?: string }>
  >(({ id, expected, deleteWorktree, deleteBranch }) => [
    'rm',
    '--descendants',
    `--expect=${expected.join(',')}`,
    ...(deleteWorktree ? ['--delete-worktree'] : []),
    ...(deleteBranch ? ['--delete-branch'] : []),
    '--',
    id,
  ]),
  /** A fresh session's agent swapped in place (CONTEXT.md, Swap). */
  'sessions.swap': commandWith<{ id: string; agent: Agent }, Recorded<SessionRecord>>(
    ({ id, agent }) => ['swap', '--', id, agent],
  ),
  'sessions.resume': commandWith<{ id: string }, Recorded<SessionRecord>>(({ id }) => [
    'resume',
    '--',
    id,
  ]),
  'sessions.fork': commandWith<{ id: string; branch?: string }, Recorded<SessionRecord>>(
    ({ id, branch }) => ['fork', ...(branch ? [`--branch=${branch}`] : []), '--', id],
  ),
  'sessions.dependencies': commandWith<
    { id: string; parent?: string | null; after?: string },
    Recorded<SessionRecord>
  >(({ id, parent, after }) => [
    'dependency',
    ...(parent === undefined ? [] : ['--parent', parent ?? 'none']),
    ...(after === undefined ? [] : ['--after', after]),
    '--',
    id,
  ]),
  'sessions.forceStart': commandWith<{ id: string }, Recorded<SessionRecord>>(({ id }) => [
    'force-start',
    '--',
    id,
  ]),
  'sessions.handoff': commandWith<
    { id: string; note: string; keep: boolean; agent?: string },
    Recorded<{ from: string; to: string; note: string }>
  >(({ id, note, keep, agent }) => [
    'handoff',
    '--note',
    note,
    ...(keep ? ['--keep'] : []),
    ...(agent ? ['--agent', agent] : []),
    '--',
    id,
  ]),
  'sessions.logs': commandWith<{ id: string; tail: number }, SessionLog>(({ id, tail }) => [
    'logs',
    '--tail',
    String(tail),
    '--',
    id,
  ]),
  'sessions.resize': commandWith<
    { id: string; cols: number; rows: number },
    { session: string; target: string; cols: number; rows: number }
  >(({ id, cols, rows }) => ['resize', '--', id, String(cols), String(rows)]),
  // The user's terminal app (terminal.app); the app's own terminal runs `attach --print`'s argv.
  'sessions.attach': commandWith<{ id: string }, Attached>(({ id }) => [
    'attach',
    '--app',
    '--',
    id,
  ]),
  // A project's sessions side by side, in the user's terminal app.
  'sessions.show': commandWith<
    { id: string },
    SessionRecord & { alive: boolean; instructions: InstructionStatus; vault: InstructionStatus }
  >(({ id }) => ['show', '--', id]),
  // `--goal=` and `--branch=` hand a value starting with `-` to mesa, which refuses it with its
  // own message; a blank one passes none. `--no-parent`: a person opening one here is not a
  // session starting a child, even when the app itself was started inside a Mesa window.
  'sessions.open': commandWith<
    {
      project?: string;
      general?: boolean;
      agent?: Agent;
      mode?: 'plan';
      background?: boolean;
      goal?: string;
      branch?: string;
      /** Its own worktree on a branch Mesa names. */
      worktree?: boolean;
      /** An existing linked worktree to run in. */
      checkout?: string;
      terminal?: boolean;
      parent?: string;
      /** The imported item it starts from; `goal` is then its whole goal, as edited. */
      from?: string;
      /** Its additional projects, each in a worktree on its branch (implies `worktree`). */
      with?: readonly string[];
    },
    Recorded<SessionRecord>
  >(
    ({
      project,
      general,
      agent,
      mode,
      background,
      goal,
      branch,
      worktree,
      checkout,
      terminal,
      parent,
      from,
      with: extra,
    }) => [
      'open',
      ...(from ? [`--from=${from}`, '--exact-goal'] : []),
      ...(parent ? ['--parent', parent] : ['--no-parent']),
      ...(agent ? ['--agent', agent] : []),
      ...(mode ? ['--mode', mode] : []),
      ...(background ? ['--background'] : []),
      ...(goal?.trim() ? [`--goal=${goal}`] : []),
      ...(extra ?? []).map((name) => `--with=${name}`),
      ...(branch?.trim() ? [`--branch=${branch.trim()}`] : []),
      ...(worktree ? ['--worktree'] : []),
      ...(checkout ? [`--checkout=${checkout}`] : []),
      ...(terminal ? ['--terminal'] : []),
      ...(general ? ['--general'] : []),
      '--',
      ...(project ? [project] : []),
    ],
  ),
  // The row's project, which the board read from its folder, so both place it alike.
  'sessions.adopt': commandWith<
    { agentSessionId: string; project?: string },
    Recorded<SessionRecord>
  >(({ agentSessionId, project }) => [
    'adopt',
    ...(project ? ['--project', project] : []),
    '--',
    agentSessionId,
  ]),
  'sessions.history': commandWith<{ project: string }, NativeHistory>(({ project }) => [
    'history',
    '--',
    project,
  ]),
  // The default 30 days, machine-wide.
  'sessions.discover': command<NativeDiscovery>('discover'),
  'sessions.search': commandWith<{ project: string; query: string }, ConversationSearch>(
    ({ project, query }) => ['history', 'search', '--', project, query],
  ),
  'sessions.all': command<TreeRow[]>('sessions', '--all', '--tree'),
};
