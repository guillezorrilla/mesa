import type { StartResult } from '@mesa/core/phone';
import { router } from 'expo-router';
import { startTransition, useActionState, useState } from 'react';
import { Alert } from 'react-native';
import { setDraft } from '../compose/drafts';
import { useDraft } from '../compose/useDraft';
import { useMac } from '../mac/useMac';
import { canStart, launchLine, NEW_FORM, type StartForm, startCall } from './startForm';

/** What the last start came to: the guardrail's ask or block, or why it failed. */
export type StartOutcome = { result?: StartResult; error?: string };

/** The drafts file keeps a new session's goal under this key, a ticket's under its own. */
const draftKey = (from?: string) => (from ? `start:${from}` : 'start');

/**
 * The start form: its choices, its goal (a draft kept across launches), and starting it, after
 * the person confirms the launch line. A started session replaces this screen; the guardrail's
 * ask stays with Start anyway, its block says why.
 */
export function useStart({ project, from }: { project?: string; from?: string }) {
  const link = useMac();
  const [form, setForm] = useState<StartForm>({ ...NEW_FORM, project });
  const [goal, setGoal] = useDraft(draftKey(from));
  const [afterTitle, setAfterTitle] = useState<string>();
  const [outcome, dispatch, starting] = useActionState(
    (_last: StartOutcome, yes: boolean): Promise<StartOutcome> =>
      link.call(startCall(form, goal, from, yes)).then(
        (result) => {
          if (result.status !== 'started' || !result.session) return { result };
          setDraft(draftKey(from), '');
          router.replace(`/agents/${result.session}`);
          return {};
        },
        (error: Error) => ({ error: error.message }),
      ),
    {},
  );
  const start = (yes: boolean) => startTransition(() => dispatch(yes));
  const line = launchLine(form, afterTitle);
  const confirm = () =>
    Alert.alert('Start this session?', line, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start', onPress: () => start(false) },
    ]);
  return {
    form,
    change: (patch: Partial<StartForm>) => setForm((f) => ({ ...f, ...patch })),
    goal,
    setGoal,
    setAfterTitle,
    line,
    ready: canStart(form, goal, from) && !starting,
    starting,
    outcome,
    confirm,
    startAnyway: () => start(true),
  };
}
