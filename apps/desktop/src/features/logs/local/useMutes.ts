import { useMemo } from 'react';
import { useKept } from '@/lib/keptValue';

/** The kept list, or none when it is missing or does not read as a list of strings. */
function readMutes(kept: string | undefined): string[] {
  try {
    const list: unknown = JSON.parse(kept ?? '[]');
    return Array.isArray(list) ? list.filter((each) => typeof each === 'string') : [];
  } catch {
    return [];
  }
}

/** The lines muted in `project`'s Logs panel (isMuted), kept per project, and their add and remove. */
export function useMutes(project: string | undefined) {
  const [kept, keep] = useKept(project && `mesa.logs.mutes.${project}`);
  const mutes = useMemo(() => readMutes(kept), [kept]);
  const save = (next: string[]) => keep(next.length ? JSON.stringify(next) : undefined);
  return {
    mutes,
    add: (mute: string) => save([...new Set([...mutes, mute])]),
    remove: (mute: string) => save(mutes.filter((each) => each !== mute)),
  };
}
