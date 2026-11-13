import type { StartCall, StartResult } from '@mesa/core/phone';
import { router } from 'expo-router';
import { startTransition, useActionState, useState } from 'react';
import { Alert } from 'react-native';
import { haptic } from '@/lib/haptics';
import { setDraft } from '../compose/drafts';
import { useDraft } from '../compose/useDraft';
import { useMac } from '../mac/useMac';
import { useMacRead } from '../mac/useMacRead';
import { canStart, launchLine, NEW_FORM, type StartForm, sameStart, startCall } from './startForm';

/** What the last start came to, and the start it was: the guardrail's ask or block, or an error. */
export type StartOutcome = { result?: StartResult; error?: string; call?: StartCall };

/** The drafts file keeps a new session's goal under this key, a ticket's under its own. */
const draftKey = (from?: string) => (from ? `start:${from}` : 'start');

/**
 * The start form: the projects and open sessions to pick from, its choices, its goal (a draft
 * kept across launches), and starting it once the person confirms the launch line. A started
 * session replaces this screen; the guardrail's ask (with Start anyway) or block shows until the
 * start changes.
 */
export function useStart({ project, from }: { project?: string; from?: string }) {
  const link = useMac();
  const projects = useMacRead({ method: 'projects' }).answer;
  const sessions = useMacRead({ method: 'sessions' }).answer;
  const [form, setForm] = useState<StartForm>({ ...NEW_FORM, project });
  const [goal, setGoal] = useDraft(draftKey(from));
  const [outcome, dispatch, starting] = useActionState(
    (_last: StartOutcome, yes: boolean): Promise<StartOutcome> => {
      const call = startCall(form, goal, from, yes);
      return link.call(call).then(
        (result) => {
          haptic(result.status === 'started' ? 'success' : 'warning');
          if (result.status !== 'started') return { result, call };
          setDraft(draftKey(from), '');
          router.replace(`/agents/${result.session}`);
          return {};
        },
        (error: Error) => {
          haptic('error');
          return { error: error.message, call };
        },
      );
    },
    {},
  );
  const start = (yes: boolean) => startTransition(() => dispatch(yes));
  const line = launchLine(form);
  const now = startCall(form, goal, from);
  return {
    projects,
    sessions,
    form,
    change: (patch: Partial<StartForm>) => setForm((f) => ({ ...f, ...patch })),
    goal,
    setGoal,
    line,
    ready: canStart(form, goal, from) && !starting,
    starting,
    outcome: outcome.call && sameStart(outcome.call, now) ? outcome : {},
    confirm: () =>
      Alert.alert('Start this session?', line, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start', onPress: () => start(false) },
      ]),
    startAnyway: () => start(true),
  };
}
