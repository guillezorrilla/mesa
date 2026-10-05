import type { Config, ProjectRow } from '@mesa/core';
import { useEffect, useRef } from 'react';

/**
 * Whether Find from sessions is offered (CONTEXT.md, First-run discovery): discovery was started
 * and not finished, or is pending with no project registered. False until config and projects load.
 */
function discoveryOffered(config: Config | undefined, projects: readonly ProjectRow[] | undefined) {
  const state = config?.onboarding?.discovery;
  return state === 'started' || (state === 'pending' && projects?.length === 0);
}

/** Offers Find from sessions once per launch, once config and projects load and onboarding is done. */
export function useDiscoveryOffer(props: {
  config: Config | undefined;
  projects: readonly ProjectRow[] | undefined;
  /** Onboarding shows, or will: its Projects step takes the offer's place. */
  settingUp: boolean;
  offer: () => void;
}) {
  const { config, projects, settingUp, offer } = props;
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || settingUp || !config || !projects) return;
    decided.current = true;
    if (discoveryOffered(config, projects)) offer();
  }, [config, projects, settingUp, offer]);
}
