import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MesaRoot } from './lib/MesaRoot';
import { tauriBridge } from './lib/tauri';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

// The app entrypoint: the only place that picks the real bridge.
createRoot(root).render(
  <StrictMode>
    <MesaRoot bridge={tauriBridge}>
      <App />
    </MesaRoot>
  </StrictMode>,
);
