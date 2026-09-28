import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { open } from '@tauri-apps/plugin-dialog';
import { fromBase64 } from './bytes';
import type { Bridge } from './client';
import type { Platform } from './platform';

/** The real bridge: the Rust `run_mesa` command, which spawns the mesa CLI. */
export const tauriBridge: Bridge = (args) => invoke('run_mesa', { args });

/** The real platform: Tauri's native dialogs, the Rust terminals, and the pasteboard. */
export const tauriPlatform: Platform = {
  deepLinks: { current: getCurrent, onOpen: onOpenUrl },
  pickFolder: async () => {
    const picked = await open({ directory: true });
    return typeof picked === 'string' ? picked : null;
  },
  pickFile: async () => {
    const picked = await open({ directory: false, multiple: false });
    return typeof picked === 'string' ? picked : null;
  },
  terminal: {
    open: (sessionId, cols, rows) => invoke('term_open', { sessionId, cols, rows }),
    write: (termId, data) => invoke('term_write', { termId, data }),
    resize: (termId, cols, rows) => invoke('term_resize', { termId, cols, rows }),
    close: (termId) => invoke('term_close', { termId }),
    onData: (termId, listener) =>
      listen<string>(`term://data/${termId}`, (e) => listener(fromBase64(e.payload))),
    onExit: (termId, listener) => listen(`term://exit/${termId}`, () => listener()),
    ready: (termId) => invoke('term_ready', { termId }),
  },
  clipboard: { write: (text) => invoke('clipboard_write', { text }) },
};
