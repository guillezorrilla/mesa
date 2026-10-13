import type { NativeResponse, SessionResponses } from '@mesa/core';
import { MessageSquareQuote } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import type { CommandState } from '@/lib/useCommand';
import { GuardrailDialog } from '../dialogs/GuardrailDialog';
import { ResponseReviewForm } from './ResponseReviewForm';
import { ResponseRow } from './ResponseRow';
import { useResponseReview } from './useResponseReview';

/**
 * The session's replies beside its terminal, each fenced block copied on its own; the selected
 * reply open in place under it with its full text, and Comment for exact passage feedback;
 * `initialResponse` opens on that reply. While
 * `shown` is false only its guardrail question stays, so its selection and comment outlast a look
 * at the changes.
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
  const { act } = useAct();
  const review = useResponseReview(sessionId, responses, initialResponse);
  const data = responses.data;
  return (
    <>
      {shown && (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 text-sm">
          {data?.unavailable && <p className="text-muted-foreground">{data.unavailable}</p>}
          {data?.rows.length === 0 && !data.unavailable && (
            <p className="text-muted-foreground">No replies yet.</p>
          )}
          {data?.truncated && <Muted size="xs">Showing recent replies only.</Muted>}
          {Boolean(data?.reviews.length) && (
            <section aria-label="Saved review comments" className="space-y-1 rounded border p-2">
              <h3 className="font-medium">Saved comments</h3>
              {data?.reviews.map((saved) => (
                <p key={saved.id} className="text-xs">
                  <span className="text-muted-foreground">{saved.status}: </span>
                  {saved.comment}
                </p>
              ))}
            </section>
          )}
          <div className="space-y-1">
            {data?.rows.map((row) => (
              <ResponseRow
                key={row.source}
                response={row}
                open={review.selected?.source === row.source}
                onOpen={() => {
                  if (review.selected?.source !== row.source) review.select(row);
                }}
                onCopy={(text, what) =>
                  void act(async () => {
                    await platform.clipboard.write(text);
                    return said(`${what} copied`);
                  })
                }
              >
                {review.commenting ? (
                  <ResponseReviewForm review={review} />
                ) : (
                  <div className="space-y-2">
                    <p className="whitespace-pre-wrap break-words text-xs">{row.text}</p>
                    <Button size="sm" variant="outline" onClick={review.startComment}>
                      <MessageSquareQuote aria-hidden /> Comment
                    </Button>
                  </div>
                )}
              </ResponseRow>
            ))}
          </div>
        </div>
      )}
      {review.ask && (
        <GuardrailDialog
          action="send"
          about={`feedback to ${sessionId}`}
          check={review.ask}
          disabled={review.acting}
          onConfirm={() => review.send(true)}
          onCancel={review.dismissAsk}
        />
      )}
    </>
  );
}
