import type {
  GuardrailCheck,
  NativeResponse,
  ResponseReviewPreview,
  SessionResponses,
} from '@mesa/core';
import { useEffect, useState } from 'react';
import { type Message, said } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import { type CommandState, useCall } from '@/lib/useCommand';
import { guardrailOf } from '../dialogs/GuardrailDialog';
import { reviewOutcome } from './reviewOutcome';

/**
 * One response review's state: the response selected (`initialResponse` first), its passage and
 * comment, the preview, and sending it, with the guardrail's question when it asks. A selected
 * response the list no longer holds is let go.
 */
export function useResponseReview(
  sessionId: string,
  responses: CommandState<SessionResponses>,
  initialResponse?: NativeResponse,
) {
  const call = useCall();
  const { act, acting } = useAct();
  const [selected, setSelected] = useState(initialResponse);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [comment, setComment] = useState('');
  const [preview, setPreview] = useState<ResponseReviewPreview>();
  const [ask, setAsk] = useState<GuardrailCheck>();
  const [deliveredId, setDeliveredId] = useState<string>();
  const [failure, setFailure] = useState<string>();

  useEffect(() => {
    if (
      selected &&
      responses.data &&
      !responses.data.rows.some((row) => row.source === selected.source)
    ) {
      setSelected(undefined);
      setPreview(undefined);
    }
  }, [responses.data, selected]);

  const selection = () =>
    selected && {
      id: sessionId,
      profile: selected.profile,
      source: selected.source,
      revision: selected.revision,
      start: range.start,
      end: range.end,
      comment,
    };
  const saved = (status: (s: string) => boolean) =>
    responses.data?.reviews.some((review) => review.id === preview?.id && status(review.status));
  const showPreview = () =>
    act(async (): Promise<Message | undefined> => {
      const input = selection();
      if (!input) return undefined;
      const result = await call('review.preview', input);
      if (!result.ok) return { text: result.error.message, tone: 'alert' };
      setPreview(result.data);
      setFailure(undefined);
      return undefined;
    });
  const send = (yes = false) =>
    act(async (): Promise<Message | undefined> => {
      const input = selection();
      if (!input || !preview || deliveredId === preview.id) return undefined;
      const result = await call('review.send', { ...input, yes });
      if (result.ok) {
        void responses.refresh();
        setAsk(undefined);
        if (result.data.status === 'delivered') {
          setDeliveredId(preview.id);
          return said(
            result.data.already ? 'Review was already delivered' : `Review sent to ${sessionId}`,
            result.data,
          );
        }
        const outcome = reviewOutcome(result.data, 'Review');
        setFailure(outcome.detail);
        return outcome.message;
      }
      const check = guardrailOf(result.error);
      if (check?.verdict === 'ask' && !yes) {
        setAsk(check);
        return undefined;
      }
      setAsk(undefined);
      setFailure(
        `${result.error.message} Delivery is not confirmed; inspect the session before retrying.`,
      );
      return { text: result.error.message, tone: 'alert' };
    });

  return {
    acting,
    selected,
    range,
    comment,
    preview,
    ask,
    failure,
    /** Sent already, or saved as anything but failed: it is not sent again. */
    sent: Boolean(preview && (deliveredId === preview.id || saved((s) => s !== 'failed'))),
    delivered: Boolean(preview && (deliveredId === preview.id || saved((s) => s === 'delivered'))),
    select: (row: NativeResponse) => {
      setSelected(row);
      setRange({ start: 0, end: 0 });
      setPreview(undefined);
      setFailure(undefined);
    },
    selectRange: (next: { start: number; end: number }) => {
      setRange(next);
      setPreview(undefined);
    },
    editComment: (next: string) => {
      setComment(next);
      setPreview(undefined);
    },
    showPreview: () => void showPreview(),
    send: (yes?: boolean) => void send(yes),
    dismissAsk: () => setAsk(undefined),
  };
}

export type ResponseReview = ReturnType<typeof useResponseReview>;
