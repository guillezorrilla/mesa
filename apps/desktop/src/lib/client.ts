import type {
  Agent,
  Attached,
  Checkout,
  ClaudeHooksStatus,
  CommandReference,
  Config,
  DiscoveredProject,
  DoctorReport,
  GitBranch,
  GitBranchAction,
  GitCommit,
  GitDiff,
  GitPathAction,
  GitStatus,
  GridGroup,
  HooksStatus,
  Opened,
  ProfileInfo,
  Project,
  ProjectRow,
  Removed,
  Result,
  Sent,
  SessionLog,
  SessionRecord,
  SkillRow,
  SkillSync,
  StopOutcome,
  TmuxWindow,
  TreeRow,
  VaultStatus,
  Viewed,
  WorkflowStatus,
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
  'config.get': command<Config>('config'),
  'board.move': commandWith<
    { id: string; direction: 'up' | 'down' },
    Recorded<{ order: string[] }>
  >(({ id, direction }) => ['board', 'move', '--', id, direction]),
  'grid.list': command<GridGroup[]>('grid'),
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
  'skills.list': commandWith<{ project?: string }, SkillRow[]>(({ project }) => [
    'skills',
    'list',
    ...(project ? ['--', project] : []),
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
    { id: string; deleteWorktree?: boolean; deleteBranch?: boolean },
    Recorded<Removed>
  >(({ id, deleteWorktree, deleteBranch }) => [
    'rm',
    ...(deleteWorktree ? ['--delete-worktree'] : []),
    ...(deleteBranch ? ['--delete-branch'] : []),
    '--',
    id,
  ]),
  'sessions.stop': commandWith<{ id: string }, Recorded<SessionRecord & { outcome: StopOutcome }>>(
    ({ id }) => ['stop', '--', id],
  ),
  'sessions.resume': commandWith<{ id: string }, Recorded<SessionRecord>>(({ id }) => [
    'resume',
    '--',
    id,
  ]),
  'sessions.handoff': commandWith<
    { id: string; note: string; keep: boolean },
    Recorded<{ from: string; to: string; note: string }>
  >(({ id, note, keep }) => ['handoff', '--note', note, ...(keep ? ['--keep'] : []), '--', id]),
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
  // `--goal=` and `--branch=` hand a value starting with `-` to mesa, which refuses it with its
  // own message; a blank one passes none. `--no-parent`: a person opening one here is not a
  // session starting a child, even when the app itself was started inside a Mesa window.
  'sessions.open': commandWith<
    { project: string; agent?: Agent; goal?: string; branch?: string },
    Recorded<SessionRecord>
  >(({ project, agent, goal, branch }) => [
    'open',
    '--no-parent',
    ...(agent ? ['--agent', agent] : []),
    ...(goal?.trim() ? [`--goal=${goal}`] : []),
    ...(branch?.trim() ? [`--branch=${branch.trim()}`] : []),
    '--',
    project,
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
  'sessions.all': command<TreeRow[]>('sessions', '--all', '--tree'),
  'vault.open': command<Recorded<Opened>>('vault', 'open'),
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
