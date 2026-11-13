import type { Config } from '../../profile/config.js';
import type { PhonePushes } from '../protocol/pushes.js';

/** The config functions the CLI uses (`mesa config`, `mesa config set`). */
export type PushesDeps = {
  settings: () => Config['phone'];
  set: (path: string, value: string) => unknown;
};

/** Sets each of `set` as `mesa config set phone.<key>` does, then reads the settings back. */
export function answerPushes(deps: PushesDeps, set: Partial<PhonePushes> = {}): PhonePushes {
  for (const [key, value] of Object.entries(set)) deps.set(`phone.${key}`, String(value));
  const { push, awayAfter, finished } = deps.settings();
  return { push, awayAfter, finished };
}
