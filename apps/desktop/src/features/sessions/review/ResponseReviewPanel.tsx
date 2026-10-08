import type { NativeResponse, SessionResponses } from '@mesa/core';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import type { CommandState } from '@/lib/useCommand';
import { GuardrailDialog } from '../dialogs/GuardrailDialog';
import { ResponseReviewForm } from './ResponseReviewForm';
import { ResponseRow } from './ResponseRow';
import { useResponseReview } from './useResponseReview';

/**
 * Native responses beside the selected terminal, with copy and exact passage feedback, the
 * selected one's review open in place under it; `initialResponse` opens on that response. While
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
            <p className="text-muted-foreground">No native responses yet.</p>
          )}
          {data?.truncated && <Muted size="xs">Showing recent transcript responses only.</Muted>}
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
                onCopy={() =>
                  void act(async () => {
                    await platform.clipboard.write(row.text);
                    return said('Response copied');
                  })
                }
              >
                <ResponseReviewForm review={review} />
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
