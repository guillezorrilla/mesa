import { MesaError } from '../lib/result.js';

// Pure, for the app too (`@mesa/core/browser`): the New profile dialog previews the same slug.

/** What a profile name may be: it names a folder, a tmux socket, and Keychain services. */
const PROFILE_NAME = /^[A-Za-z0-9_-]{1,64}$/;

export const validProfileName = (name: string) => PROFILE_NAME.test(name);

/** `name` itself when it is a valid profile name, else a usage error naming the rule. */
export function profileName(name: string): string {
  if (!validProfileName(name))
    throw new MesaError(
      'usage',
      `${JSON.stringify(name)} is not a profile name: use 1 to 64 letters, digits, - or _`,
    );
  return name;
}

/** The profile name a typed label becomes: `Client Work!` is `client-work`. */
export const profileSlug = (label: string) =>
  label
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean)
    .join('-')
    .slice(0, 64);

/** A new profile's own vault folder, beside the first vault Mesa suggests (`~/Documents/Mesa`). */
export const profileVault = (suggested: string, name: string) => `${suggested}-${name}`;
