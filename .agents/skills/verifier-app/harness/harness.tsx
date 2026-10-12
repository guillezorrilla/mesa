import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import type { Bridge } from '@/lib/client';
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

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <MesaRoot bridge={bridge} platform={fakePlatform()}>
      <App />
    </MesaRoot>
  </StrictMode>,
);
