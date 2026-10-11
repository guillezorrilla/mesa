import { useEffect, useRef, useState } from 'react';
import { useCommand } from '@/lib/useCommand';

/** Where giving Mesa access to more repos stands. */
export type AccessStatus =
  | { step: 'idle' }
  | { step: 'waiting' }
  | { step: 'added'; repos: string[] }
  | { step: 'none' };

/**
 * The repos Mesa's GitHub App can read for `project` (its remote first), and giving it access to
 * more: `start` as the person opens the app's installation page on GitHub, then, when they come
 * back to the window, the list reads again and says which repos are new (or that none are).
 */
export function useRepoAccess(project: string) {
  const repos = useCommand('tickets.repos', { project });
  const [status, setStatus] = useState<AccessStatus>({ step: 'idle' });
  const before = useRef<string[]>([]);
  const checking = useRef(false);
  const names = (repos.data?.repos ?? []).map((r) => r.fullName);
  const waiting = status.step === 'waiting';
  const { refresh } = repos;

  useEffect(() => {
    if (!waiting) return;
    const back = () => {
      checking.current = true;
      void refresh();
    };
    window.addEventListener('focus', back);
    return () => window.removeEventListener('focus', back);
  }, [waiting, refresh]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a read after coming back lands.
  useEffect(() => {
    if (!checking.current || repos.busy) return;
    checking.current = false;
    const added = names.filter((name) => !before.current.includes(name));
    setStatus(added.length ? { step: 'added', repos: added } : { step: 'none' });
  }, [repos.data, repos.busy]);

  return {
    repos: repos.data?.repos,
    install: repos.data?.install,
    status,
    /** The person is giving Mesa access on GitHub: what it reads now is what it read before. */
    start: () => {
      before.current = names;
      setStatus({ step: 'waiting' });
    },
  };
}
