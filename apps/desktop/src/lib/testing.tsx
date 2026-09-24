import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Bridge } from './client';
import { MesaRoot } from './MesaRoot';

// React needs this flag to run act() outside a test renderer.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A bridge that answers each mesa command (the argv word after --json) from `answers`, recording calls. */
export function fakeBridge(answers: Record<string, () => unknown>) {
  const calls: string[][] = [];
  const bridge: Bridge = async (args) => {
    calls.push(args);
    const answer = answers[args[1] ?? ''];
    if (!answer) throw new Error(`no fake answer for ${args.join(' ')}`);
    return answer();
  };
  return { bridge, calls };
}

/** Renders `ui` inside the same MesaRoot main.tsx uses, over `bridge`; returns a test-id query. */
export async function renderWithMesa(ui: ReactNode, bridge: Bridge) {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root') as HTMLElement;
  await act(async () => createRoot(root).render(<MesaRoot bridge={bridge}>{ui}</MesaRoot>));
  return (id: string) => [...root.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
}
