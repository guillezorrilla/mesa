import type { CloudErrorGroup } from '@mesa/core';
import { errorFixGoal, GENERAL_PROJECT, serviceRefOf } from '@mesa/core/browser';
import { useState } from 'react';
import { useRun } from '@/lib/useCommand';
import { useCloudLogsConfig } from './useCloudLogsConfig';

/** The service a group's fix is remembered for: `<project>/<service>`. */
const refOf = (group: CloudErrorGroup) =>
  serviceRefOf({ project: group.project, service: group.services[0] ?? null });

/**
 * Fix in session (CONTEXT.md, Cloud Logs): a session with the group's errorFixGoal, in the project
 * its service is remembered for, else after the person picks one (`picking`), which can be kept.
 */
export function useFixInSession(onSession: (id: string) => void) {
  const { fixProjects, rememberFix } = useCloudLogsConfig();
  const run = useRun();
  const [picking, setPicking] = useState<CloudErrorGroup>();
  const fixIn = async (group: CloudErrorGroup, project: string) => {
    const goal = errorFixGoal(group);
    const session = await run(
      'sessions.open',
      project === GENERAL_PROJECT ? { general: true, goal } : { project, goal },
    );
    if (session?.id) onSession(session.id);
  };
  return {
    picking,
    /** The service the picked group's fix would be remembered for. */
    pickingRef: picking ? refOf(picking) : undefined,
    fix: (group: CloudErrorGroup) => {
      const mapped = fixProjects[refOf(group)];
      if (mapped) void fixIn(group, mapped);
      else setPicking(group);
    },
    pick: async (project: string, remember: boolean) => {
      const group = picking;
      setPicking(undefined);
      if (!group) return;
      if (remember) await rememberFix(refOf(group), project);
      await fixIn(group, project);
    },
    cancel: () => setPicking(undefined),
  };
}
