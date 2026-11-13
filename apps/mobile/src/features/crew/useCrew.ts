import { type PhoneCrew, REWATCH_MS } from '@mesa/core/phone';
import { startTransition, useState } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import type { MacLink } from '../mac/macLink';
import { useMac } from '../mac/useMac';
import { useMacUpdates } from '../mac/useMacUpdates';
import { crewMoved } from './crewMoved';

/** The crew as read, or the last one when the Mac does not answer; none from a Mac without crews. */
const read = (link: MacLink, id: string, last?: Promise<PhoneCrew | undefined>) =>
  link.call({ method: 'crew', id }).then(
    (crew): PhoneCrew | undefined => crew,
    () => last,
  );

/**
 * A session's crew and task graph as a promise to `use()`, read again when an update the Mac
 * pushed moves the crew (crewMoved), and every minute in front.
 */
export function useCrew(id: string) {
  const link = useMac();
  const [crew, setCrew] = useState(() => read(link, id));
  // Made here, not in an updater, which React may run again while it suspends.
  const again = () => {
    const next = read(link, id, crew);
    startTransition(() => setCrew(next));
  };
  useRepeatWhileActive(REWATCH_MS, () => {
    // ponytail: a session with no crew when opened is not asked again; reopen it to see one.
    void crew.then((last) => {
      if (last?.workers.length || last?.tasks.length) again();
    });
  });
  useMacUpdates((update) => {
    void crew.then((last) => {
      if (crewMoved(id, last, update)) again();
    });
  });
  return crew;
}
