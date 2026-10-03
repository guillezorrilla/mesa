import { useCommand } from '@/lib/useCommand';

/** The profile's rules and scheduler status, refreshed together after a change. */
export function useAutomations() {
  const rules = useCommand('automations.list');
  const scheduler = useCommand('automations.status');
  const refresh = () => {
    void rules.refresh();
    void scheduler.refresh();
  };
  return { rules, scheduler, refresh };
}

export type Automations = ReturnType<typeof useAutomations>;
