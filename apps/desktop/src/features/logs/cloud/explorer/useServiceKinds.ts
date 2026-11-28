import type { CloudVolume } from '@mesa/core';
import { useMemo } from 'react';
import { useOptional } from '@/lib/useCommand';

/**
 * Each service's kind (GKE, Cloud Run or App Engine) by `<project>/<name>`: what the picker's
 * services of `env` say (logs.gcpServices), and the range's counts by service (`volume`).
 */
export function useServiceKinds(env: string | undefined, volume: CloudVolume | undefined) {
  const kinds = useOptional('logs.gcpServices', { env });
  const counted = volume?.counted ? volume.services : undefined;
  return useMemo(
    () =>
      new Map<string, string | null>(
        [...(kinds.data?.services ?? []), ...(counted ?? [])].map((s) => [
          `${s.project}/${s.name}`,
          s.kind,
        ]),
      ),
    [kinds.data, counted],
  );
}
