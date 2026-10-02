import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Bridge } from '../client';
import { MesaRoot } from '../MesaRoot';
import { fakePlatform } from './fakePlatform';

// React needs this flag to run act() outside a test renderer.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Root | undefined;

/** Renders `ui` inside the same MesaRoot main.tsx uses, over fakes; returns a test-id query. */
export async function renderWithMesa(ui: ReactNode, bridge: Bridge, platform = fakePlatform()) {
  // The previous render goes first, so its timers (the Board's looks) stop with it.
  await act(async () => mounted?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root') as HTMLElement;
  mounted = createRoot(root);
  const created = mounted;
  await act(async () =>
    created.render(
      <MesaRoot bridge={bridge} platform={platform}>
        {ui}
      </MesaRoot>,
    ),
  );
  // The whole document: a dialog renders in a portal outside the root. The body is fresh per render.
  return (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
}
