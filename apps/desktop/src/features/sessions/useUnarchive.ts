import { Undo2 } from 'lucide-react';
import { useCallback } from 'react';
import { type Message, said, type ToastLink } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';

/** A session to unarchive, with what its toast calls it (sessionTitle). */
type Titled = { id: string; title: string };

/**
 * Unarchives sessions, one `mesa unarchive` each, and says what it did: the Archived section's
 * Unarchive and an archive's Undo. A failure is toasted on its own and the rest go on.
 */
export function useUnarchive() {
  const run = useRun();
  const unarchive = useCallback(
    async (rows: readonly Titled[]): Promise<Message | undefined> => {
      let done = 0;
      const warnings: string[] = [];
      for (const row of rows) {
        const restored = await run('sessions.unarchive', { id: row.id });
        if (!restored) continue;
        done += 1;
        if (restored.warning) warnings.push(restored.warning);
      }
      if (done === 0) return undefined;
      const [only] = rows;
      const text =
        rows.length === 1 && only ? `Unarchived ${only.title}` : `Unarchived ${done} sessions`;
      return said(text, warnings.length ? { warning: warnings.join('; ') } : undefined);
    },
    [run],
  );
  /** The Undo a toast about archiving `rows` carries: `act` runs it and toasts what it did. */
  const undo = (
    rows: readonly Titled[],
    act: (action: () => Promise<Message | undefined>) => Promise<void>,
  ): ToastLink => ({
    label: 'Undo',
    icon: Undo2,
    onFollow: () => void act(() => unarchive(rows)),
  });
  return { unarchive, undo };
}
