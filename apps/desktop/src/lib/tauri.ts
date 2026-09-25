import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type { Bridge } from './client';
import type { Platform } from './platform';

/** The real bridge: the Rust `run_mesa` command, which spawns the mesa CLI. */
export const tauriBridge: Bridge = (args) => invoke('run_mesa', { args });

/** base64 (how `term://data` events carry bytes, SP-3) back to bytes. */
const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

/** The real platform: Tauri's native dialogs, the Rust terminals, and the pasteboard. */
export const tauriPlatform: Platform = {
  pickFolder: async () => {
    const picked = await open({ directory: true });
    return typeof picked === 'string' ? picked : null;
  },
  terminal: {
    open: (sessionId, cols, rows) => invoke('term_open', { sessionId, cols, rows }),
    write: (termId, data) => invoke('term_write', { termId, data }),
    resize: (termId, cols, rows) => invoke('term_resize', { termId, cols, rows }),
    close: (termId) => invoke('term_close', { termId }),
    onData: (termId, listener) =>
      listen<string>(`term://data/${termId}`, (e) => listener(bytes(e.payload))),
    onExit: (termId, listener) => listen(`term://exit/${termId}`, () => listener()),
  },
  clipboard: {
    write: (text) => invoke('clipboard_write', { text }),
    read: () => invoke('clipboard_read'),
  },
};
