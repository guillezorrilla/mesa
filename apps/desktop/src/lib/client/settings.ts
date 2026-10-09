import type { Config, ProfileInfo, ProfileRow, SavedPrompt } from '@mesa/core';
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
  'profile.list': command<ProfileRow[]>('profile', 'list'),
  'profile.create': commandWith<
    { name: string; vault?: string; copySettings: boolean },
    { profile: string; dir: string; vault: string }
  >(({ name, vault, copySettings }) => [
    'profile',
    'create',
    ...(vault ? [`--vault=${vault}`] : ['--new-vault']),
    ...(copySettings ? ['--copy-settings'] : []),
    '--',
    name,
  ]),
  'profile.rename': commandWith<{ from: string; to: string }, { from: string; to: string }>(
    ({ from, to }) => ['profile', 'rename', '--', from, to],
  ),
  'profile.remove': commandWith<{ name: string }, { profile: string; vault: string | null }>(
    ({ name }) => ['profile', 'remove', '--yes', '--', name],
  ),
  'profile.use': commandWith<{ name: string }, { profile: string }>(({ name }) => [
    'profile',
    'use',
    '--',
    name,
  ]),
  'profile.open': commandWith<{ name: string }, { profile: string; dir: string }>(({ name }) => [
    'profile',
    'open',
    '--',
    name,
  ]),
  'profile.init': commandWith<{ vault: string }, Recorded<ProfileInfo & { created: boolean }>>(
    ({ vault }) => ['init', `--vault=${vault}`],
  ),
};
