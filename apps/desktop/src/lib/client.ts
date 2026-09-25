import type {
  Config,
  DoctorReport,
  Opened,
  ProfileInfo,
  Project,
  ProjectRow,
  ReceiptEntry,
  Result,
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
  'vault.open': command<Opened>('vault', 'open'),
  'vault.status': command<VaultStatus>('vault', 'status'),
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
