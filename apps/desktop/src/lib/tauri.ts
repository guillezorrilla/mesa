import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { open } from '@tauri-apps/plugin-dialog';
import { fromBase64 } from './bytes';
import type { Bridge } from './client';
import type { BrowserSelection, Platform } from './platform';

/** The real bridge: the Rust `run_mesa` command, which spawns the mesa CLI. */
export const tauriBridge: Bridge = (args) => invoke('run_mesa', { args });

const browserLifecycle = new Map<string, Promise<unknown>>();
function withBrowserLifecycle<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const next = (browserLifecycle.get(sessionId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(task);
  browserLifecycle.set(sessionId, next);
  void next
    .finally(() => {
      if (browserLifecycle.get(sessionId) === next) browserLifecycle.delete(sessionId);
    })
    .catch(() => undefined);
  return next;
}

/** The real platform: Tauri's native dialogs, the Rust terminals, and the pasteboard. */
export const tauriPlatform: Platform = {
  lifecycle: {
    onCloseRequested: (handler) => getCurrentWindow().onCloseRequested(handler),
    close: () => getCurrentWindow().close(),
  },
  deepLinks: { current: getCurrent, onOpen: onOpenUrl },
  notifications: {
    status: () => invoke('notification_status'),
    requestPermission: () => invoke('notification_request_permission'),
    send: ({ id, title, body, sound, target }) =>
      invoke('notification_send', { id, title, body, sound, target }),
    onOpen: (handler) =>
      listen('notification-open', (event) =>
        handler(event.payload as Parameters<typeof handler>[0]),
      ),
    takeOpened: () => invoke('notification_take_opened'),
  },
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
  browser: {
    owner: () => invoke('browser_owner'),
    open: (sessionId, url, bounds) =>
      withBrowserLifecycle(sessionId, () =>
        invoke('browser_open', { session: sessionId, url, ...bounds }),
      ),
    navigate: (sessionId, url) =>
      withBrowserLifecycle(sessionId, () =>
        invoke('browser_navigate', { session: sessionId, url }),
      ),
    bounds: (sessionId, bounds) =>
      withBrowserLifecycle(sessionId, () =>
        invoke('browser_bounds', { session: sessionId, ...bounds }),
      ),
    close: (sessionId) =>
      withBrowserLifecycle(sessionId, () => invoke('browser_close', { session: sessionId })),
    probe: (sessionId) =>
      withBrowserLifecycle(sessionId, () => invoke('browser_probe', { session: sessionId })),
    back: (sessionId) =>
      withBrowserLifecycle(sessionId, () => invoke('browser_back', { session: sessionId })),
    forward: (sessionId) =>
      withBrowserLifecycle(sessionId, () => invoke('browser_forward', { session: sessionId })),
    reload: (sessionId) =>
      withBrowserLifecycle(sessionId, () => invoke('browser_reload', { session: sessionId })),
    pickStart: (sessionId) =>
      withBrowserLifecycle(sessionId, () => invoke('browser_pick_start', { session: sessionId })),
    pickResult: (sessionId) =>
      withBrowserLifecycle(sessionId, () =>
        invoke<BrowserSelection | null>('browser_pick_result', { session: sessionId }),
      ),
    onLoad: (listener) =>
      listen<{ session: string; url: string }>('browser://load', (event) =>
        listener(event.payload),
      ),
  },
  clipboard: { write: (text) => invoke('clipboard_write', { text }) },
};
