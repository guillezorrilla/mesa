import type {
  CallResult,
  PhoneCall,
  PhoneDraft,
  PhonePrDetail,
  PhoneThread,
} from '@mesa/core/phone';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert } from 'react-native';
import { SLOW_MS } from '../mac/slowCall';
import { tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import { MERGE_WORDS, type MergeHow, mergeAsk } from './mergeAsk';
import { sendText } from './sendText';

const HOWS = Object.keys(MERGE_WORDS) as MergeHow[];

/**
 * What the PR screen does through the Mac, each asked first the iOS way (a sheet, a prompt or an
 * alert): start or open a review, discard a draft, reply to or resolve a thread, merge, and send
 * a failed check to the session on the branch. `busy` names the one running; `again` reads the
 * PR anew after it.
 */
export function usePrActions(pr: { project: string; number: number }, again: () => void) {
  const link = useMac();
  const [busy, setBusy] = useState<string>();
  const ref = { project: pr.project, number: pr.number };
  /** Runs `call` with `label` shown, then `done` with its result, or says why it failed. */
  const run = async <M extends PhoneCall['method']>(
    label: string,
    call: Extract<PhoneCall, { method: M }>,
    done?: (result: CallResult<M>) => void,
  ) => {
    setBusy(label);
    const read = await tryCall(link, () => link.call(call, SLOW_MS));
    setBusy(undefined);
    if (read.error !== undefined) return Alert.alert(`Could not finish: ${label}`, read.error);
    if (read.result) done?.(read.result);
    again();
  };

  const start = (post: boolean) =>
    run('Starting a review', { method: 'prStart', ...ref, post }, ({ session }) =>
      router.push(`/agents/${session}`),
    );
  const review = (detail: PhonePrDetail) => {
    if (detail.review) return router.push(`/agents/${detail.review.session}`);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Start a review session',
        message:
          'Leave as drafts: only you see its comments until you submit them. Post now: the session publishes them as comments when it is done.',
        options: ['Leave as drafts', 'Post now', 'Cancel'],
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index < 2) void start(index === 1);
      },
    );
  };
  const discard = (draft: PhoneDraft) =>
    Alert.alert('Discard this draft?', 'It is deleted on the provider and cannot be restored.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () =>
          void run('Discarding the draft', { method: 'prDiscard', ...ref, draft: draft.id }),
      },
    ]);
  const reply = (thread: PhoneThread) =>
    Alert.prompt(
      'Reply',
      'Left as a pending draft: only you see it until you submit the review.',
      (text) => {
        if (text.trim())
          void run('Drafting the reply', {
            method: 'prReply',
            ...ref,
            thread: thread.id,
            text: text.trim(),
          });
      },
    );
  const resolve = (thread: PhoneThread) =>
    run(thread.resolved ? 'Reopening the thread' : 'Resolving the thread', {
      method: 'prResolve',
      ...ref,
      thread: thread.id,
      resolved: !thread.resolved,
    });
  const mergeWith = (detail: PhonePrDetail, how: MergeHow) => {
    const ask = mergeAsk(detail, how);
    Alert.alert(ask.title, ask.message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: ask.action,
        style: ask.confirm ? 'destructive' : 'default',
        onPress: () =>
          void run('Merging', { method: 'prMerge', ...ref, how, confirm: ask.confirm }, (merged) =>
            Alert.alert('Merged', `#${detail.number} merged at ${merged.head.slice(0, 7)}.`),
          ),
      },
    ]);
  };
  const merge = (detail: PhonePrDetail) =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `Merge #${detail.number}`,
        options: [...HOWS.map((h) => MERGE_WORDS[h]), 'Cancel'],
        cancelButtonIndex: HOWS.length,
      },
      (index) => {
        const how = HOWS[index];
        if (how) mergeWith(detail, how);
      },
    );
  const send = () =>
    run('Sending to the session', { method: 'prSend', ...ref }, (sent) =>
      Alert.alert('Send to the session', sendText(sent)),
    );
  return { busy, review, discard, reply, resolve, merge, send };
}
