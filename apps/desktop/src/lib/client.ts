import type {
  Agent,
  Attached,
  Checkout,
  ClaudeHooksStatus,
  CommandReference,
  Config,
  ConversationSearch,
  DeliveryPlan,
  DescendantResult,
  DiagnosticReport,
  DiscoveredProject,
  DoctorReport,
  FileChange,
  FileLink,
  FileSearch,
  FileTree,
  GitBranch,
  GitBranchAction,
  GitCommit,
  GitComparison,
  GitDiff,
  GitGraph,
  GitPathAction,
  GitStatus,
  GitSync,
  GitTracking,
  GridGroup,
  HooksStatus,
  InboxItem,
  InstructionStatus,
  NativeHistory,
  Opened,
  ProfileInfo,
  Project,
  ProjectRow,
  ReceiptEntry,
  Removed,
  RepositoryInsight,
  Result,
  RuleRow,
  Sent,
  SessionLog,
  SessionRecord,
  SkillInventoryRow,
  SkillSync,
  StashAction,
  StashCreated,
  StashEntry,
  StopOutcome,
  TmuxWindow,
  TreeRow,
  UsageReport,
  VaultStatus,
  Viewed,
  WorkflowStatus,
  WorkspaceFile,
  Worktree,
  WorktreeAction,
  WorktreePreview,
  WorktreeRow,
} from '@mesa/core';

/** Sends one mesa argv and resolves with the envelope it printed. The seam between the renderer and the CLI. */
export type Bridge = (args: string[]) => Promise<unknown>;

// `data` is never set: it only carries the envelope's data type.
type Spec<Args, Data> = { argv: (args: Args) => string[]; data?: Data };
/** A command without arguments. */
const command = <Data>(...argv: string[]): Spec<undefined, Data> => ({ argv: () => argv });
/** A command whose argv is built from its arguments. */
const commandWith = <Args, Data>(argv: (args: Args) => string[]): Spec<Args, Data> => ({ argv });

/**
 * A recorded command's data: its receipt, and a warning when the action or its receipt had one
 * (recordedOutput in the CLI puts both there).
 */
type Recorded<T> = T & { receipt: { id: string; path: string } | null; warning?: string };

/** Every command the app runs: its mesa argv and the type of its data. The client adds --json. */
const COMMANDS = {
  'git.insight': commandWith<{ project: string; checkout?: string }, RepositoryInsight>(
    ({ project, checkout }) => [
      'git',
      'insight',
      ...(checkout ? ['--checkout', checkout] : []),
      '--',
      project,
    ],
  ),
  'config.get': command<Config>('config'),
  'board.move': commandWith<
    { id: string; direction: 'up' | 'down' },
    Recorded<{ order: string[] }>
  >(({ id, direction }) => ['board', 'move', '--', id, direction]),
  'grid.list': command<GridGroup[]>('grid'),
  'files.tree': commandWith<{ project: string; checkout?: string }, FileTree>(
    ({ project, checkout }) => [
      'files',
      'tree',
      ...(checkout ? ['--checkout', checkout] : []),
      '--',
      project,
    ],
  ),
  'files.search': commandWith<
    { project: string; checkout?: string; query: string; content?: boolean },
    FileSearch
  >(({ project, checkout, query, content }) => [
    'files',
    'search',
    ...(checkout ? ['--checkout', checkout] : []),
    ...(content ? ['--content'] : []),
    '--',
    project,
    query,
  ]),
  'files.read': commandWith<
    { project: string; checkout?: string; path: string; line?: number },
    WorkspaceFile & { targetLine?: number }
  >(({ project, checkout, path, line }) => [
    'files',
    'read',
    ...(checkout ? ['--checkout', checkout] : []),
    ...(line ? ['--line', String(line)] : []),
    '--',
    project,
    path,
  ]),
  'files.open': commandWith<
    { project: string; checkout?: string; path: string; line?: number },
    Recorded<{ checkout: Checkout; path: string; line: number; opened: boolean }>
  >(({ project, checkout, path, line }) => [
    'files',
    'open',
    ...(checkout ? ['--checkout', checkout] : []),
    ...(line ? ['--line', String(line)] : []),
    '--',
    project,
    path,
  ]),
  'files.link': commandWith<{ session: string; target: string }, FileLink>(
    ({ session, target }) => ['files', 'link', '--', session, target],
  ),
  'worktrees.list': commandWith<{ project: string }, WorktreeRow[]>(({ project }) => [
    'worktrees',
    'list',
    '--',
    project,
  ]),
  'worktrees.create': commandWith<
    { project: string; branch: string; base?: string },
    Recorded<Worktree>
  >(({ project, branch, base }) => [
    'worktrees',
    'create',
    ...(base ? ['--base', base] : []),
    '--',
    project,
    branch,
  ]),
  'worktrees.rerun': commandWith<
    { project: string; checkout: string },
    Recorded<{ path: string; ran: true }>
  >(({ project, checkout }) => ['worktrees', 'rerun', '--', project, checkout]),
  'worktrees.preview': commandWith<
    { project: string; action: WorktreeAction; checkout?: string },
    WorktreePreview
  >(({ project, action, checkout }) => [
    'worktrees',
    'preview',
    '--action',
    action,
    '--',
    project,
    ...(checkout ? [checkout] : []),
  ]),
  'worktrees.apply': commandWith<
    { project: string; action: WorktreeAction; token: string; checkout?: string },
    Recorded<{
      action: WorktreeAction;
      paths: string[];
      destination?: string;
      remaining?: string[];
      teardownRan?: boolean;
    }>
  >(({ project, action, token, checkout }) => [
    'worktrees',
    'apply',
    '--action',
    action,
    '--token',
    token,
    '--',
    project,
    ...(checkout ? [checkout] : []),
  ]),
  'files.write': commandWith<
    { project: string; checkout?: string; path: string; text: string; revision: string },
    Recorded<FileChange>
  >(({ project, checkout, path, text, revision }) => [
    'files',
    'write',
    ...(checkout ? ['--checkout', checkout] : []),
    `--text=${text}`,
    '--revision',
    revision,
    '--',
    project,
    path,
  ]),
  'files.create': commandWith<
    { project: string; checkout?: string; path: string; text?: string },
    Recorded<FileChange>
  >(({ project, checkout, path, text }) => [
    'files',
    'create',
    ...(checkout ? ['--checkout', checkout] : []),
    `--text=${text ?? ''}`,
    '--',
    project,
    path,
  ]),
  'files.rename': commandWith<
    { project: string; checkout?: string; from: string; path: string; revision: string },
    Recorded<FileChange>
  >(({ project, checkout, from, path, revision }) => [
    'files',
    'rename',
    ...(checkout ? ['--checkout', checkout] : []),
    '--revision',
    revision,
    '--',
    project,
    from,
    path,
  ]),
  'files.delete': commandWith<
    { project: string; checkout?: string; path: string; revision: string },
    Recorded<FileChange>
  >(({ project, checkout, path, revision }) => [
    'files',
    'delete',
    ...(checkout ? ['--checkout', checkout] : []),
    '--revision',
    revision,
    '--',
    project,
    path,
  ]),
  'git.status': commandWith<{ project: string; checkout?: string }, GitStatus>(
    ({ project, checkout }) => [
      'git',
      'status',
      ...(checkout ? ['--checkout', checkout] : []),
      '--',
      project,
    ],
  ),
  'git.diff': commandWith<
    { project: string; checkout?: string; path?: string; staged?: boolean },
    GitDiff
  >(({ project, checkout, path, staged }) => [
    'git',
    'diff',
    ...(checkout ? ['--checkout', checkout] : []),
    ...(staged ? ['--staged'] : []),
    '--',
    project,
    ...(path ? [path] : []),
  ]),
  'git.stage': commandWith<
    { project: string; checkout?: string; path: string },
    Recorded<GitPathAction>
  >(({ project, checkout, path }) => [
    'git',
    'stage',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    path,
  ]),
  'git.unstage': commandWith<
    { project: string; checkout?: string; path: string },
    Recorded<GitPathAction>
  >(({ project, checkout, path }) => [
    'git',
    'unstage',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    path,
  ]),
  'git.commit': commandWith<
    { project: string; checkout?: string; message: string },
    Recorded<GitCommit>
  >(({ project, checkout, message }) => [
    'git',
    'commit',
    ...(checkout ? ['--checkout', checkout] : []),
    `--message=${message}`,
    '--',
    project,
  ]),
  'git.branches': commandWith<
    { project: string; checkout?: string },
    { checkout: Checkout; branches: GitBranch[] }
  >(({ project, checkout }) => [
    'git',
    'branches',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
  ]),
  'git.branchCreate': commandWith<
    { project: string; checkout?: string; name: string; base?: string },
    Recorded<GitBranchAction>
  >(({ project, checkout, name, base }) => [
    'git',
    'branch',
    'create',
    ...(checkout ? ['--checkout', checkout] : []),
    ...(base ? ['--base', base] : []),
    '--',
    project,
    name,
  ]),
  'git.branchCheckout': commandWith<
    { project: string; checkout?: string; name: string },
    Recorded<GitBranchAction>
  >(({ project, checkout, name }) => [
    'git',
    'branch',
    'checkout',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    name,
  ]),
  'git.branchDelete': commandWith<
    { project: string; checkout?: string; name: string },
    Recorded<GitBranchAction>
  >(({ project, checkout, name }) => [
    'git',
    'branch',
    'delete',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    name,
  ]),
  'git.stashes': commandWith<
    { project: string; checkout?: string },
    { checkout: Checkout; stashes: StashEntry[] }
  >(({ project, checkout }) => [
    'git',
    'stashes',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
  ]),
  'git.stashCreate': commandWith<
    { project: string; checkout?: string; message?: string },
    Recorded<StashCreated>
  >(({ project, checkout, message }) => [
    'git',
    'stash',
    'create',
    ...(checkout ? ['--checkout', checkout] : []),
    ...(message ? [`--message=${message}`] : []),
    '--',
    project,
  ]),
  'git.stashApply': commandWith<
    { project: string; checkout?: string; ref: string },
    Recorded<StashAction>
  >(({ project, checkout, ref }) => [
    'git',
    'stash',
    'apply',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    ref,
  ]),
  'git.stashPop': commandWith<
    { project: string; checkout?: string; ref: string },
    Recorded<StashAction>
  >(({ project, checkout, ref }) => [
    'git',
    'stash',
    'pop',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    ref,
  ]),
  'git.stashDrop': commandWith<
    { project: string; checkout?: string; ref: string },
    Recorded<StashAction>
  >(({ project, checkout, ref }) => [
    'git',
    'stash',
    'drop',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    ref,
  ]),
  'git.tracking': commandWith<{ project: string; checkout?: string }, GitTracking>(
    ({ project, checkout }) => [
      'git',
      'tracking',
      ...(checkout ? ['--checkout', checkout] : []),
      '--',
      project,
    ],
  ),
  'git.push': commandWith<{ project: string; checkout?: string }, Recorded<GitSync>>(
    ({ project, checkout }) => [
      'git',
      'push',
      ...(checkout ? ['--checkout', checkout] : []),
      '--yes',
      '--',
      project,
    ],
  ),
  'git.pull': commandWith<{ project: string; checkout?: string }, Recorded<GitSync>>(
    ({ project, checkout }) => [
      'git',
      'pull',
      ...(checkout ? ['--checkout', checkout] : []),
      '--yes',
      '--',
      project,
    ],
  ),
  'git.graph': commandWith<{ project: string; checkout?: string; branch?: string }, GitGraph>(
    ({ project, checkout, branch }) => [
      'git',
      'graph',
      ...(checkout ? ['--checkout', checkout] : []),
      ...(branch ? ['--branch', branch] : []),
      '--',
      project,
    ],
  ),
  'git.compare': commandWith<
    { project: string; checkout?: string; base: string; head: string },
    GitComparison
  >(({ project, checkout, base, head }) => [
    'git',
    'compare',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    base,
    head,
  ]),
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
  'config.set': commandWith<
    { path: string; value: unknown },
    Recorded<{ path: string; value: unknown }>
  >(({ path, value }) => ['config', 'set', '--', path, JSON.stringify(value)]),
  'doctor.run': command<DoctorReport>('doctor'),
  'diagnostics.list': commandWith<{ event?: string }, DiagnosticReport>(({ event }) => [
    'diagnostics',
    ...(event ? ['--event', event] : []),
  ]),
  'usage.list': command<UsageReport>('usage'),
  'notifications.list': command<InboxItem[]>('notifications'),
  'notifications.delivery': command<DeliveryPlan>('notifications', 'delivery'),
  'notifications.delivered': commandWith<{ ids: string[] }, { ids: string[]; delivered: true }>(
    ({ ids }) => ['notifications', 'delivered', '--', ids.join(',')],
  ),
  'notifications.read': commandWith<{ id: string }, { id: string; read: true }>(({ id }) => [
    'notifications',
    'read',
    '--',
    id,
  ]),
  'notifications.clear': commandWith<{ id: string }, { id: string; cleared: true }>(({ id }) => [
    'notifications',
    'clear',
    '--',
    id,
  ]),
  'help.reference': command<CommandReference[]>('help', '--agent'),
  'hooks.status': command<HooksStatus>('hooks', 'status'),
  'hooks.install': command<Recorded<ClaudeHooksStatus & { changed: boolean }>>('hooks', 'install'),
  'hooks.uninstall': command<Recorded<ClaudeHooksStatus & { changed: boolean }>>(
    'hooks',
    'uninstall',
  ),
  'log.add': commandWith<{ text: string }, { entry: string; daily: string }>(({ text }) => [
    'log',
    '--',
    text,
  ]),
  'profile.get': command<ProfileInfo>('profile'),
  'receipts.list': commandWith<
    { project?: string; session?: string; kind: 'decision' | 'guardrail' | 'vault-change' },
    ReceiptEntry[]
  >(({ project, session, kind }) => [
    'receipts',
    '--kind',
    kind,
    ...(project ? ['--project', project] : []),
    ...(session ? ['--session', session] : []),
  ]),
  'projects.list': command<ProjectRow[]>('projects'),
  'projects.discover': commandWith<{ path: string }, DiscoveredProject[]>(({ path }) => [
    'projects',
    'discover',
    '--',
    path,
  ]),
  'projects.clone': commandWith<
    { url: string },
    Recorded<Project & { path: string; created: boolean; url: string }>
  >(({ url }) => ['projects', 'clone', '--', url]),
  'projects.update': commandWith<
    { name: string; label?: string; pinned?: boolean; hidden?: boolean; move?: 'up' | 'down' },
    Recorded<{ name: string; path: string; label?: string; pinned?: boolean; hidden?: boolean }>
  >(({ name, label, pinned, hidden, move }) => [
    'projects',
    'update',
    ...(label !== undefined ? [`--label=${label}`] : []),
    ...(pinned !== undefined ? ['--pinned', String(pinned)] : []),
    ...(hidden !== undefined ? ['--hidden', String(hidden)] : []),
    ...(move ? ['--move', move] : []),
    '--',
    name,
  ]),
  'projects.unregister': commandWith<{ name: string }, Recorded<{ name: string; path: string }>>(
    ({ name }) => ['unregister', '--', name],
  ),
  'skills.list': commandWith<{ project?: string }, SkillInventoryRow[]>(({ project }) => [
    'skills',
    'list',
    ...(project ? ['--', project] : []),
  ]),
  'rules.list': commandWith<{ project?: string }, RuleRow[]>(({ project }) => [
    'rules',
    'list',
    ...(project ? ['--project', project] : []),
  ]),
  'rules.read': commandWith<{ id: string; project?: string }, WorkspaceFile>(({ id, project }) => [
    'rules',
    'read',
    ...(project ? ['--project', project] : []),
    '--',
    id,
  ]),
  'rules.write': commandWith<
    { id: string; project?: string; text: string; revision: string },
    Recorded<FileChange>
  >(({ id, project, text, revision }) => [
    'rules',
    'write',
    ...(project ? ['--project', project] : []),
    `--text=${text}`,
    '--revision',
    revision,
    '--',
    id,
  ]),
  'skills.read': commandWith<{ id: string; project?: string; file?: string }, WorkspaceFile>(
    ({ id, project, file }) => [
      'skills',
      'read',
      ...(project ? ['--project', project] : []),
      ...(file ? ['--file', file] : []),
      '--',
      id,
    ],
  ),
  'skills.write': commandWith<
    { id: string; project?: string; file?: string; text: string; revision: string },
    Recorded<FileChange>
  >(({ id, project, file, text, revision }) => [
    'skills',
    'write',
    ...(project ? ['--project', project] : []),
    ...(file ? ['--file', file] : []),
    `--text=${text}`,
    '--revision',
    revision,
    '--',
    id,
  ]),
  // A skill run (CONTEXT.md, Skill run), which resolves when the run ends: minutes. The skill's
  // words go after `--` as one, so words starting with `-` are its own. `--yes` answers a
  // guardrail's ask; the app never passes `--force`, so a block is final here.
  'skills.sync': commandWith<{ project: string }, Recorded<SkillSync>>(({ project }) => [
    'skills',
    'sync',
    '--',
    project,
  ]),
  'skills.set': commandWith<
    { project: string; name: string; enabled: boolean },
    Recorded<{
      project: string;
      name: string;
      enabled: boolean;
      skills: string[];
      changed: boolean;
    }>
  >(({ project, name, enabled }) => [
    'skills',
    'set',
    '--enabled',
    String(enabled),
    '--',
    project,
    name,
  ]),
  // `--` so a path starting with `-` is never read as a flag.
  'projects.register': commandWith<
    { path: string },
    Recorded<Project & { path: string; created: boolean }>
  >(({ path }) => ['register', '--create', '--', path]),
  // The board as mesa orders it: attention, children under their parent.
  'sessions.list': command<TreeRow[]>('sessions', '--tree'),
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
  'sessions.workflow': commandWith<
    { id: string; status: WorkflowStatus | 'clear' },
    Recorded<SessionRecord>
  >(({ id, status }) => ['workflow', '--', id, status]),
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
  'sessions.unarchive': commandWith<{ id: string }, Recorded<SessionRecord>>(({ id }) => [
    'unarchive',
    '--',
    id,
  ]),
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
  'sessions.view': commandWith<{ project: string }, Viewed>(({ project }) => [
    'view',
    '--app',
    '--',
    project,
  ]),
  'sessions.show': commandWith<
    { id: string },
    SessionRecord & { alive: boolean; instructions: InstructionStatus }
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
      terminal?: boolean;
      parent?: string;
    },
    Recorded<SessionRecord>
  >(({ project, general, agent, mode, background, goal, branch, terminal, parent }) => [
    'open',
    ...(parent ? ['--parent', parent] : ['--no-parent']),
    ...(agent ? ['--agent', agent] : []),
    ...(mode ? ['--mode', mode] : []),
    ...(background ? ['--background'] : []),
    ...(goal?.trim() ? [`--goal=${goal}`] : []),
    ...(branch?.trim() ? [`--branch=${branch.trim()}`] : []),
    ...(terminal ? ['--terminal'] : []),
    ...(general ? ['--general'] : []),
    '--',
    ...(project ? [project] : []),
  ]),
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
  'sessions.search': commandWith<{ project: string; query: string }, ConversationSearch>(
    ({ project, query }) => ['history', 'search', '--', project, query],
  ),
  'sessions.all': command<TreeRow[]>('sessions', '--all', '--tree'),
  'vault.open': command<Recorded<Opened>>('vault', 'open'),
  'vault.openNote': commandWith<{ note: string }, Opened>(({ note }) => [
    'vault',
    'open',
    '--',
    note,
  ]),
  'vault.status': command<VaultStatus>('vault', 'status'),
  'windows.list': command<TmuxWindow[]>('windows'),
};

export type CommandName = keyof typeof COMMANDS;
export type DataOf<K extends CommandName> = (typeof COMMANDS)[K] extends { data?: infer D }
  ? D
  : never;
type ArgsOf<K extends CommandName> = (typeof COMMANDS)[K] extends {
  argv: (args: infer A) => string[];
}
  ? A
  : never;
/** Commands without arguments take none; the others require theirs. */
export type CallArgs<K extends CommandName> = [ArgsOf<K>] extends [undefined] ? [] : [ArgsOf<K>];

export function createClient(bridge: Bridge) {
  return {
    /** Resolves with the envelope; rejects only when mesa printed none (see run_mesa). */
    call<K extends CommandName>(name: K, ...args: CallArgs<K>): Promise<Result<DataOf<K>>> {
      const argv = (COMMANDS[name].argv as (args: unknown) => string[])(args[0]);
      // --json first: global flags may precede the command, and never follow a `--`.
      return bridge(['--json', ...argv]) as Promise<Result<DataOf<K>>>;
    },
  };
}

export type Client = ReturnType<typeof createClient>;
