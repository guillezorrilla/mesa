import type { TicketDefaults } from '@mesa/core/browser';
import { useRef, useState } from 'react';
import { useRun } from '@/lib/useCommand';

/**
 * Saving `project`'s ticket settings, from the gear or the Options sheet: its defaults, its own
 * ticket prompt, and the one all projects share. `onChanged` runs after each save that lands, and
 * `saving` holds while any is pending.
 */
export function useTicketSettings(project: string, onChanged: () => void) {
  const run = useRun();
  const [pending, setPending] = useState(0);
  const queue = useRef(Promise.resolve());
  // One save at a time, in order: each rewrites tickets.yaml, so two at once could lose one.
  const save = (write: () => Promise<unknown>) => {
    setPending((n) => n + 1);
    queue.current = queue.current.then(async () => {
      try {
        if (await write()) onChanged();
      } finally {
        setPending((n) => n - 1);
      }
    });
  };
  return {
    saving: pending > 0,
    setDefault: (change: Partial<TicketDefaults>) =>
      save(() => run('tickets.defaults', { project, change })),
    /** The project's own prompt; null clears it, so the one all projects share applies. */
    setPrompt: (name: string | null) =>
      save(() => run('tickets.prompt', { ...(name ? { name } : {}), project })),
    /** The prompt all projects share; null clears it. */
    setSharedPrompt: (name: string | null) =>
      save(() => run('tickets.prompt', name ? { name } : {})),
  };
}
