import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import type { Bridge } from '@/lib/client';
import type { Platform } from '@/lib/platform';
import { MesaRoot } from '@/lib/MesaRoot';
import { fakePlatform } from '@/lib/testing';
import '@/style.css';

// The real App; only the bridge (HTTP to the worktree's CLI) and the OS platform are swapped.
const bridge: Bridge = async (args, stdin) => {
  const res = await fetch('/__mesa', { method: 'POST', body: JSON.stringify({ args, stdin }) });
  const envelope = await res.json();
  if (!envelope.ok && envelope.error?.code === 'bridge') throw new Error(envelope.error.message);
  return envelope;
};

// The Rust follow (follow.rs) as a streamed request to the harness's `/__follow`.
const follows = new Map<string, { abort: AbortController; listeners: Set<(line: string) => void> }>();
let nextFollow = 0;
const follow: Platform['follow'] = {
  open: async (sessionId, count) => {
    const id = `f${++nextFollow}-${Date.now()}`;
    const entry = { abort: new AbortController(), listeners: new Set<(line: string) => void>() };
    follows.set(id, entry);
    void fetch(`/__follow?session=${sessionId}&count=${count}&key=${id}`, {
      signal: entry.abort.signal,
    })
      .then(async (res) => {
        const reader = res.body?.pipeThrough(new TextDecoderStream()).getReader();
        let rest = '';
        for (;;) {
          const { value, done } = (await reader?.read()) ?? { done: true };
          if (done) break;
          const lines = (rest + value).split('\n');
          rest = lines.pop() ?? '';
          for (const line of lines) if (line.trim()) for (const l of entry.listeners) l(line);
        }
      })
      .catch(() => undefined);
    return id;
  },
  onLine: async (id, listener) => {
    follows.get(id)?.listeners.add(listener);
    return () => follows.get(id)?.listeners.delete(listener);
  },
  onExit: async () => () => {},
  ready: async () => {},
  write: async (id, line) => {
    const res = await fetch(`/__follow_write?key=${id}`, { method: 'POST', body: line });
    if (!res.ok) throw new Error("the chat's follow is not running");
  },
  close: async (id) => {
    follows.get(id)?.abort.abort();
    follows.delete(id);
  },
};

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <MesaRoot bridge={bridge} platform={{ ...fakePlatform(), follow }}>
      <App />
    </MesaRoot>
  </StrictMode>,
);
