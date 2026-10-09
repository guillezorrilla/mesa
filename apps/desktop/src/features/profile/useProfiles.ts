import { useCallback } from 'react';
import { usePlatform } from '@/lib/MesaRoot';
import { useCommand, useRun } from '@/lib/useCommand';

/** Every profile, and switching the app to one: `mesa profile use`, then a relaunch on it. */
export function useProfiles() {
  const { data: profiles, refresh } = useCommand('profile.list');
  const run = useRun();
  const platform = usePlatform();
  const switchTo = useCallback(
    async (name: string) => {
      if (await run('profile.use', { name })) await platform.profiles.switch(name);
    },
    [run, platform],
  );
  return { profiles, refresh, switchTo };
}
