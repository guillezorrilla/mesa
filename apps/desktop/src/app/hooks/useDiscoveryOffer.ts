import type { Config, ProjectRow } from '@mesa/core';
import { useEffect, useRef } from 'react';

/**
 * Offers Find from sessions once per launch (CONTEXT.md, First-run discovery), once config and
 * projects load and Set up is behind: when discovery was started and not finished, or is pending
 * with no project registered.
 */
export function useDiscoveryOffer(props: {
  config: Config | undefined;
  projects: readonly ProjectRow[] | undefined;
  /** Set up shows, or will: the offer waits for its Continue. */
  settingUp: boolean;
  offer: () => void;
}) {
  const { config, projects, settingUp, offer } = props;
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || settingUp || !config || !projects) return;
    decided.current = true;
    const state = config.onboarding?.discovery;
    if (state === 'started' || (state === 'pending' && projects.length === 0)) offer();
  }, [config, projects, settingUp, offer]);
}
