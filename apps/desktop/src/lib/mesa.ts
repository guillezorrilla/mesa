import type { Check, Result } from '@mesa/core';
import { invoke } from '@tauri-apps/api/core';

type NoArgs = Record<string, never>;

/** Every app command: the arguments it takes and the `data` type of its envelope. */
export interface Commands {
  'doctor.run': { args: NoArgs; data: Check[] };
  'profile.get': { args: NoArgs; data: { profile: string; dir: string } };
}

const ARGV: { [K in keyof Commands]: (args: Commands[K]['args']) => string[] } = {
  'doctor.run': () => ['doctor', '--json'],
  'profile.get': () => ['profile', '--json'],
};

/**
 * Runs one mesa command through the Rust `run_mesa` bridge and returns its envelope.
 * Rejects with the exit code and stderr only when mesa printed no envelope at all.
 */
export function call<K extends keyof Commands>(
  command: K,
  args = {} as Commands[K]['args'],
): Promise<Result<Commands[K]['data']>> {
  return invoke('run_mesa', { args: ARGV[command](args) });
}

/** `call` for screens: the data on success; otherwise the error text goes to `onError`. */
export async function load<K extends keyof Commands>(
  command: K,
  onError: (text: string) => void,
): Promise<Commands[K]['data'] | undefined> {
  try {
    const result = await call(command);
    if (result.ok) return result.data;
    onError(result.error.message);
  } catch (e) {
    onError(e instanceof Error ? e.message : String(e));
  }
}
