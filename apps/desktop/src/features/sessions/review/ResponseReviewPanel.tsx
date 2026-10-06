import type {
  GuardrailCheck,
  NativeResponse,
  ResponseReviewPreview,
  SessionResponses,
} from '@mesa/core';
import { Copy, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { type Message, said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { type CommandState, useCall } from '@/lib/useCommand';
import { GuardrailDialog, guardrailOf } from '../dialogs/GuardrailDialog';
import { reviewOutcome } from './reviewOutcome';

type Selection = {
  id: string;
  profile: string;
  source: string;
  revision: string;
  start: number;
  end: number;
  comment: string;
};

/**
 * Native responses beside the selected terminal, with copy and exact passage feedback;
 * `initialResponse` opens on that response. While `shown` is false only its guardrail question
 * stays, so its selection and comment outlast a look at the changes.
 */
export function ResponseReviewPanel({
  sessionId,
  responses,
  initialResponse,
  shown,
}: {
  sessionId: string;
  responses: CommandState<SessionResponses>;
  initialResponse?: NativeResponse;
  shown: boolean;
}) {
  const platform = usePlatform();
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

  const selection = (): Selection | undefined =>
    selected && {
      id: sessionId,
      profile: selected.profile,
      source: selected.source,
      revision: selected.revision,
      start: range.start,
      end: range.end,
      comment,
    };
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

  return (
    <>
      {shown && (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 text-sm">
          {responses.data?.unavailable && (
            <p className="text-muted-foreground">{responses.data.unavailable}</p>
          )}
          {responses.data?.rows.length === 0 && !responses.data.unavailable && (
            <p className="text-muted-foreground">No native responses yet.</p>
          )}
          {responses.data?.truncated && (
            <Muted size="xs">Showing recent transcript responses only.</Muted>
          )}
          {Boolean(responses.data?.reviews.length) && (
            <section aria-label="Saved review comments" className="space-y-1 rounded border p-2">
              <h3 className="font-medium">Saved comments</h3>
              {responses.data?.reviews.map((review) => (
                <p key={review.id} className="text-xs">
                  <span className="text-muted-foreground">{review.status}: </span>
                  {review.comment}
                </p>
              ))}
            </section>
          )}
          <div className="space-y-1">
            {responses.data?.rows.map((row) => (
              <div key={row.source} className="group flex items-start gap-1 rounded border p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-0 flex-1 justify-start truncate text-left"
                  onClick={() => {
                    setSelected(row);
                    setRange({ start: 0, end: 0 });
                    setPreview(undefined);
                    setFailure(undefined);
                  }}
                >
                  {row.text.split('\n')[0]}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label="Copy response"
                  onClick={() =>
                    void act(async () => {
                      await platform.clipboard.write(row.text);
                      return said('Response copied');
                    })
                  }
                >
                  <Copy aria-hidden />
                </Button>
              </div>
            ))}
          </div>
          {selected && (
            <div className="space-y-3 border-t pt-3">
              <Muted size="xs">
                {selected.agent} response {selected.source.slice(0, 12)}
                {selected.truncated ? ' (text truncated)' : ''}
              </Muted>
              <Label htmlFor="review-response-text">Select a passage to review</Label>
              <Textarea
                id="review-response-text"
                readOnly
                value={selected.text}
                className="h-40 resize-y font-mono text-xs"
                onSelect={(event) => {
                  setRange({
                    start: event.currentTarget.selectionStart,
                    end: event.currentTarget.selectionEnd,
                  });
                  setPreview(undefined);
                }}
              />
              <Muted size="xs">Selected characters: {range.end - range.start}</Muted>
              <Label htmlFor="review-comment">Comment</Label>
              <Textarea
                id="review-comment"
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                  setPreview(undefined);
                }}
                placeholder="What should the agent change or check?"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={acting || range.end <= range.start || !comment.trim()}
                onClick={() => void showPreview()}
              >
                Preview review
              </Button>
              {preview && (
                <div className="space-y-2 rounded border p-2" data-testid="response-review-preview">
                  <p className="text-xs">
                    Target: {preview.target} · Source: {preview.source.slice(0, 12)}
                  </p>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
                    {preview.prompt}
                  </pre>
                  <Button
                    size="sm"
                    disabled={
                      acting ||
                      deliveredId === preview.id ||
                      responses.data?.reviews.some(
                        (review) => review.id === preview.id && review.status !== 'failed',
                      )
                    }
                    onClick={() => void send()}
                  >
                    <Send aria-hidden />{' '}
                    {deliveredId === preview.id ||
                    responses.data?.reviews.some(
                      (review) => review.id === preview.id && review.status === 'delivered',
                    )
                      ? 'Delivered'
                      : 'Send review'}
                  </Button>
                </div>
              )}
              {failure && (
                <p role="alert" className="text-xs text-destructive">
                  {failure}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {ask && (
        <GuardrailDialog
          action="send"
          about={`feedback to ${sessionId}`}
          check={ask}
          disabled={acting}
          onConfirm={() => void send(true)}
          onCancel={() => setAsk(undefined)}
        />
      )}
    </>
  );
}
