import type { InstallStatus } from '@mesa/core';
import { command, commandWith } from './spec';

/** The anonymous install count and its switch (ADR-0026); off also erases it on the broker. */
export const installsCommands = {
  installs: command<InstallStatus>('installs'),
  'installs.set': commandWith<{ enabled: boolean }, InstallStatus & { erased?: boolean }>(
    ({ enabled }) => ['installs', enabled ? 'on' : 'off'],
  ),
};
