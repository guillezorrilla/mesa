import type { DecisionsModel, KeyProvider, KeyRow, Placed } from '@mesa/core';
import { command, commandWith, commandWithStdin } from './spec';

/**
 * Decision model commands: the models' keys (in the Keychain), which model Faro asks, and placing
 * the sessions the Board is unsure of.
 */
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
  // Beside the Board's look, never inside it: the next look shows what it saved.
  'decisions.place': command<{ placed: Placed[] }>('decisions', 'place'),
};
