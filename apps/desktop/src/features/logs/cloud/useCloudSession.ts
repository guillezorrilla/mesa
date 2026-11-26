import type { CloudErrorGroup, GuardrailCheck } from '@mesa/core';
import { mappedProject, serviceRefOf } from '@mesa/core/browser';
import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { guardrailOf } from '@/features/sessions/dialogs/GuardrailDialog';
import { useCall } from '@/lib/useCommand';
import { useCloudLogsConfig } from './useCloudLogsConfig';

/** What a session from Cloud Logs carries on: an error group to fix, or an Ask conversation. */
export type CloudSessionGoal = { group: CloudErrorGroup } | { conversation: string };

/** The service a group's fix is remembered for: `<project>/<service>`. */
const refOf = (group: CloudErrorGroup) =>
  serviceRefOf({ project: group.project, service: group.services[0] ?? null });

/** The person's answers a retry carries: prod confirmed, the guardrail's ask passed. */
type Answers = { allowProd?: boolean; yes?: boolean };

/** What the person is asked before the session starts: a prod group's projects, or the guardrail's ask. */
type Asking = { projects?: string[]; check?: GuardrailCheck; retry: () => Promise<void> };

/**
 * A session from Cloud Logs (CONTEXT.md, Fix in session; `mesa logs session`): in the project a
 * group's service is remembered for, else after the person picks one (`picking`, General by
 * default). A prod group asks first, and the goal passes the guardrail, whose ask the person answers.
 */
export type CloudSession = ReturnType<typeof useCloudSession>;

export function useCloudSession(env: string | undefined, onSession: (id: string) => void) {
  const { fixProjects, rememberFix } = useCloudLogsConfig();
  const call = useCall();
  const toast = useToast();
  const [picking, setPicking] = useState<CloudSessionGoal>();
  const [asking, setAsking] = useState<Asking>();
  const start = async (goal: CloudSessionGoal, project: string, answers: Answers = {}) => {
    const opened = await call('logs.session', { ...goal, project, env, ...answers });
    if (opened.ok) return onSession(opened.data.session.id);
    const details = opened.error.details as { reason?: string; projects?: string[] } | undefined;
    const check = guardrailOf(opened.error);
    if (opened.error.code === 'needs_approval' && details?.reason === 'prod_ask')
      setAsking({
        projects: details.projects ?? [],
        retry: () => start(goal, project, { ...answers, allowProd: true }),
      });
    else if (check?.verdict === 'ask')
      setAsking({ check, retry: () => start(goal, project, { ...answers, yes: true }) });
    else toast(opened.error.message);
  };
  return {
    picking,
    /** The service the picked group's fix would be remembered for. */
    pickingRef: picking && 'group' in picking ? refOf(picking.group) : undefined,
    asking,
    fix: (group: CloudErrorGroup) => {
      const mapped = mappedProject(fixProjects, refOf(group));
      if (mapped) void start({ group }, mapped);
      else setPicking({ group });
    },
    carry: (conversation: string) => setPicking({ conversation }),
    /** Fix in session from an answer: in `code`, the project whose code it read, else one picked. */
    fixAsk: (conversation: string, code?: string) => {
      if (code) void start({ conversation }, code);
      else setPicking({ conversation });
    },
    pick: async (project: string, remember: boolean) => {
      const goal = picking;
      setPicking(undefined);
      if (!goal) return;
      if (remember && 'group' in goal) await rememberFix([refOf(goal.group)], project);
      await start(goal, project);
    },
    cancel: () => setPicking(undefined),
    confirm: () => {
      const asked = asking;
      setAsking(undefined);
      void asked?.retry();
    },
    dismiss: () => setAsking(undefined),
  };
}
