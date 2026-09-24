import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { Bridge } from './client';
import type { Platform } from './platform';

/** The real bridge: the Rust `run_mesa` command, which spawns the mesa CLI. */
export const tauriBridge: Bridge = (args) => invoke('run_mesa', { args });

/** The real platform: Tauri's native dialogs. */
export const tauriPlatform: Platform = {
  pickFolder: async () => {
    const picked = await open({ directory: true });
    return typeof picked === 'string' ? picked : null;
  },
};
