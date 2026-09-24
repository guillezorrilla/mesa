import type { DoctorReport, ProfileInfo, Result } from '@mesa/core';

/** Sends one mesa argv and resolves with the envelope it printed. The seam between the renderer and the CLI. */
export type Bridge = (args: string[]) => Promise<unknown>;

// `data` is never set: it only carries the envelope's data type.
type Spec<Data> = { argv: string[]; data?: Data };
const spec = <Data>(...argv: string[]) => ({ argv }) as Spec<Data>;

/** Every command the app runs: its mesa argv and the type of its data. The client adds --json. */
export const COMMANDS = {
  'doctor.run': spec<DoctorReport>('doctor'),
  'profile.get': spec<ProfileInfo>('profile'),
};

export type CommandName = keyof typeof COMMANDS;
export type DataOf<K extends CommandName> = (typeof COMMANDS)[K] extends { data?: infer D }
  ? D
  : never;

export function createClient(bridge: Bridge) {
  return {
    /** Resolves with the envelope; rejects only when mesa printed none (see run_mesa). */
    call<K extends CommandName>(name: K): Promise<Result<DataOf<K>>> {
      // --json first: global flags may precede the command, and never follow a `--`.
      return bridge(['--json', ...COMMANDS[name].argv]) as Promise<Result<DataOf<K>>>;
    },
  };
}

export type Client = ReturnType<typeof createClient>;
