import type { Config, ProfileInfo, SavedPrompt } from '@mesa/core';
import { command, commandWith, type Recorded } from './spec';

/** Settings commands: the profile, its config, saved prompts, and backups. */
export const settingsCommands = {
  'config.get': command<Config>('config'),
  'prompts.list': command<SavedPrompt[]>('prompts'),
  'prompts.save': commandWith<{ name: string; text: string; replace?: boolean }, SavedPrompt>(
    ({ name, text, replace }) => [
      'prompts',
      'save',
      ...(replace ? ['--replace'] : []),
      '--',
      name,
      text,
    ],
  ),
  'prompts.remove': commandWith<{ name: string }, { name: string }>(({ name }) => [
    'prompts',
    'remove',
    '--',
    name,
  ]),
  'backup.create': command<{ path: string; createdAt: string; retained: number }>(
    'backup',
    'create',
  ),
  'backup.restore': commandWith<
    { file: string; profile: string; vault: string },
    { profile: string; path: string; vault: string; projects: number; prompts: number }
  >(({ file, profile, vault }) => [
    '--profile',
    profile,
    'backup',
    'restore',
    '--vault',
    vault,
    '--',
    file,
  ]),
  'config.set': commandWith<
    { path: string; value: unknown },
    Recorded<{ path: string; value: unknown }>
  >(({ path, value }) => ['config', 'set', '--', path, JSON.stringify(value)]),
  'profile.get': command<ProfileInfo>('profile'),
  'profile.init': commandWith<{ vault: string }, Recorded<ProfileInfo & { created: boolean }>>(
    ({ vault }) => ['init', `--vault=${vault}`],
  ),
};
