import type { CloudErrorGroup } from '@mesa/core';
import { errorFixGoal } from '@mesa/core/browser';
import { useState } from 'react';
import { useCloudLogsConfig } from './useCloudLogsConfig';
import { useCloudSession } from './useCloudSession';

/** The service a group's fix is remembered for: `<project>/<service>`. */
const refOf = (group: CloudErrorGroup) => `${group.project}/${group.services[0] ?? '-'}`;

/**
 * Fix in session (CONTEXT.md, Cloud Logs): a session with the group's errorFixGoal, in the project
 * its service is remembered for, else after the person picks one (`picking`), which can be kept.
 */
export function useFixInSession(onSession: (id: string) => void) {
  const { fixProjects, rememberFix } = useCloudLogsConfig();
  const start = useCloudSession();
  const [picking, setPicking] = useState<CloudErrorGroup>();
  const fixIn = async (group: CloudErrorGroup, project: string) => {
    const id = await start(project, errorFixGoal(group));
    if (id) onSession(id);
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
