import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { MesaRoot } from '@/lib/MesaRoot';
import { tauriBridge, tauriPlatform } from '@/lib/tauri';
import '@/style.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

// The app entrypoint: the only place that picks the real bridge and platform.
createRoot(root).render(
  <StrictMode>
    <MesaRoot bridge={tauriBridge} platform={tauriPlatform}>
      <App />
    </MesaRoot>
  </StrictMode>,
);
