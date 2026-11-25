import { ENV_WORDS, joinEnvs } from '@mesa/core/browser';
import { useEffect, useState } from 'react';
import { useOptional } from '@/lib/useCommand';
import type { EnvRow } from './types';

/**
 * The env rows of the setup and of Edit envs (CONTEXT.md, Cloud Logs): `kept` envs, then the
 * suggestions for `projects` (envSuggestions) merged in as they arrive. A kept env that is
 * suggestions joined comes back as those rows, checked; without `kept` (a first setup) the
 * guessed names start checked. `envs` is what Save writes (joinEnvs).
 */
export function useEnvRows(projects: string[], kept?: Record<string, string>) {
  const [rows, setRows] = useState<EnvRow[]>(
    Object.entries(kept ?? {}).map(([name, filter]) => ({ name, filter, on: true })),
  );
  const suggested = useOptional('logs.gcpEnvs', { projects });
  const first = !kept;
  // New suggestions keep the rows already edited; one a custom env already holds is left out.
  const suggestions = suggested.data?.suggestions;
  useEffect(() => {
    if (!suggestions) return;
    setRows((now) => {
      const custom = now.filter((row) => !row.from);
      const kept = new Map(now.filter((row) => row.from).map((row) => [row.filter, row]));
      const guessed = (name: string) => first && (ENV_WORDS as readonly string[]).includes(name);
      // A kept env that is suggestions joined (joinEnvs) comes back as those rows, checked.
      const saved = new Map<string, string>();
      const left = custom.filter((row) => {
        const parts = suggestions.filter(
          (s) => row.filter === s.filter || row.filter.includes(`(${s.filter})`),
        );
        const whole = joinEnvs(parts.map((s) => ({ name: row.name, filter: s.filter })));
        if (!parts.length || whole[row.name] !== row.filter) return true;
        for (const s of parts) saved.set(s.filter, row.name);
        return false;
      });
      const taken = new Set(left.map((row) => row.filter));
      return [
        ...suggestions
          .filter((s) => !taken.has(s.filter))
          .map((s) => {
            const name = saved.get(s.filter);
            return name
              ? { ...s, name, on: true }
              : (kept.get(s.filter) ?? { ...s, on: guessed(s.name) });
          }),
        ...left,
      ];
    });
  }, [suggestions, first]);
  return { rows, setRows, suggested, envs: joinEnvs(rows.filter((row) => row.on)) };
}
