import type { DecisionsModel, KeyProvider, KeyRow } from '@mesa/core';
import { command, commandWith, commandWithStdin } from './spec';

/** Decision model commands: the models' keys (in the Keychain) and which model Faro asks. */
export const decisionsCommands = {
  'decisions.keys': command<{ keys: KeyRow[] }>('decisions', 'key', 'list'),
  // Tests the key with one call, then saves it; the key goes on stdin, never in argv.
  'decisions.keys.set': commandWithStdin<
    { provider: KeyProvider; key: string; account?: string },
    { key: KeyRow; model: DecisionsModel }
  >(
    ({ provider, account }) => [
      'decisions',
      'key',
      'set',
      ...(account ? ['--account', account] : []),
      '--',
      provider,
    ],
    ({ key }) => key,
  ),
  'decisions.keys.remove': commandWith<
    { provider: KeyProvider },
    { provider: KeyProvider; removed: boolean; model: DecisionsModel }
  >(({ provider }) => ['decisions', 'key', 'remove', '--', provider]),
  'decisions.use': commandWith<
    { model: DecisionsModel },
    { model: DecisionsModel; changed: boolean }
  >(({ model }) => ['decisions', 'use', '--', model]),
};
