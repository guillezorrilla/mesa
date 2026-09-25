import type {
  Agent,
  Attached,
  Config,
  DoctorReport,
  HooksStatus,
  Opened,
  ProfileInfo,
  Project,
  ProjectRow,
  ReceiptEntry,
  Result,
  Sent,
  SessionRecord,
  SessionRow,
  StopOutcome,
  TmuxWindow,
  VaultStatus,
} from '@mesa/core';

/** Sends one mesa argv and resolves with the envelope it printed. The seam between the renderer and the CLI. */
export type Bridge = (args: string[]) => Promise<unknown>;

// `data` is never set: it only carries the envelope's data type.
type Spec<Args, Data> = { argv: (args: Args) => string[]; data?: Data };
/** A command without arguments. */
const command = <Data>(...argv: string[]): Spec<undefined, Data> => ({ argv: () => argv });
/** A command whose argv is built from its arguments. */
const commandWith = <Args, Data>(argv: (args: Args) => string[]): Spec<Args, Data> => ({ argv });

/** Every command the app runs: its mesa argv and the type of its data. The client adds --json. */
export const COMMANDS = {
  'config.get': command<Config>('config'),
  'doctor.run': command<DoctorReport>('doctor'),
  'hooks.status': command<HooksStatus>('hooks', 'status'),
  'hooks.install': command<HooksStatus & { changed: boolean }>('hooks', 'install'),
  'hooks.uninstall': command<HooksStatus & { changed: boolean }>('hooks', 'uninstall'),
  'log.add': commandWith<{ text: string }, { entry: string; daily: string }>(({ text }) => [
    'log',
    '--',
    text,
  ]),
  'profile.get': command<ProfileInfo>('profile'),
  'projects.list': command<ProjectRow[]>('projects'),
  // `--` so a path starting with `-` is never read as a flag.
  'projects.register': commandWith<{ path: string }, Project & { path: string; created: boolean }>(
    ({ path }) => ['register', '--create', '--', path],
  ),
  'receipts.list': command<ReceiptEntry[]>('receipts'),
  'sessions.list': command<SessionRow[]>('sessions'),
  'sessions.send': commandWith<{ id: string; prompt: string }, Omit<Sent, 'project'>>(
    ({ id, prompt }) => ['send', '--', id, prompt],
  ),
  'sessions.stop': commandWith<{ id: string }, SessionRecord & { outcome: StopOutcome }>(
    ({ id }) => ['stop', '--', id],
  ),
  'sessions.resume': commandWith<{ id: string }, SessionRecord>(({ id }) => ['resume', '--', id]),
  // The app has no terminal of its own, so it always opens the user's terminal app.
  'sessions.attach': commandWith<{ id: string }, Attached>(({ id }) => [
    'attach',
    '--app',
    '--',
    id,
  ]),
  'sessions.open': commandWith<{ project: string; agent?: Agent }, SessionRecord>(
    ({ project, agent }) => ['open', ...(agent ? ['--agent', agent] : []), '--', project],
  ),
  'sessions.all': command<SessionRow[]>('sessions', '--all'),
  'vault.open': command<Opened>('vault', 'open'),
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
