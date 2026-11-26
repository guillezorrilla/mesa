import { useKept } from '@/lib/keptValue';
import { useCommand } from '@/lib/useCommand';

/** `text` as JSON, or undefined when it is missing or does not read. */
const parsed = <T>(text: string | undefined): T | undefined => {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
};

/**
 * A Logs tab choice kept per profile on this machine, across visits and restarts (CONTEXT.md,
 * Cloud Logs), its setter, and whether the profile is known yet; `fallback` until one is kept, or
 * while the profile still loads.
 */
export function useLogsKept<T>(name: string, fallback: T) {
  const profile = useCommand('profile.get').data?.profile;
  const [kept, keep] = useKept(profile && `mesa.logs.${profile}.${name}`);
  const value = parsed<T>(kept) ?? fallback;
  const set = (next: T | undefined) => keep(next === undefined ? undefined : JSON.stringify(next));
  // Ready once the profile is known: before that nothing kept can be read.
  return [value, set, profile !== undefined] as const;
}
