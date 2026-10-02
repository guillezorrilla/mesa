import type { SavedReview } from '@mesa/core';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { type Message, said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePlatform } from '@/lib/MesaRoot';
import type { useAct } from '@/lib/useAct';
import { useCall } from '@/lib/useCommand';
import { GuardrailDialog, guardrailOf } from '../dialogs/GuardrailDialog';
import { reviewOutcome } from './reviewOutcome';
import type { BrowserSelectionState } from './useBrowserSelection';

/**
 * A comment on the element picked in the session browser: previewed as the prompt it becomes, then
 * sent to the session, past the guardrail's ask when confirmed.
 */
export function BrowserAnnotation({
  sessionId,
  profile,
  selection,
  reviews,
  act,
  acting,
  onSent,
}: {
  sessionId: string;
  /** The Mesa profile, once it has loaded. */
  profile?: string;
  selection: BrowserSelectionState;
  /** The session's reviews, so a delivered annotation is not sent twice. */
  reviews?: readonly SavedReview[];
  act: ReturnType<typeof useAct>['act'];
  acting: boolean;
  onSent: () => void;
}) {
  const platform = usePlatform();
  const call = useCall();
  const [comment, setComment] = useState('');
  const [failure, setFailure] = useState('');
  const { picked, preview, ask, setPicked, setPreview, setAsk, clearSelection } = selection;

  const input = () =>
    picked && profile !== undefined ? { id: sessionId, profile, ...picked, comment } : undefined;
  const showPreview = () =>
    act(async (): Promise<Message | undefined> => {
      const annotation = input();
      if (!annotation) return undefined;
      const fresh = await platform.browser.pickResult(sessionId);
      if (!fresh || JSON.stringify(fresh) !== JSON.stringify(picked)) {
        await clearSelection();
        return { text: 'Page selection changed. Pick the element again.', tone: 'alert' };
      }
      const result = await call('browser.annotatePreview', annotation);
      if (!result.ok) return { text: result.error.message, tone: 'alert' };
      setPreview(result.data);
      setFailure('');
      return undefined;
    });
  const send = (yes = false) =>
    act(async (): Promise<Message | undefined> => {
      const annotation = input();
      if (!annotation || !preview) return undefined;
      const fresh = await platform.browser.pickResult(sessionId);
      if (!fresh || JSON.stringify(fresh) !== JSON.stringify(picked)) {
        setPreview(undefined);
        setPicked(undefined);
        setAsk(undefined);
        return { text: 'Page selection changed. Pick the element again.', tone: 'alert' };
      }
      const result = await call('browser.annotateSend', {
        ...annotation,
        source: preview.source,
        revision: preview.revision,
        yes,
      });
      if (result.ok) {
        onSent();
        setAsk(undefined);
        if (result.data.status === 'delivered')
          return said(
            result.data.already
              ? 'Annotation was already delivered'
              : `Annotation sent to ${sessionId}`,
            result.data,
          );
        const outcome = reviewOutcome(result.data, 'Annotation');
        setFailure(outcome.detail);
        return outcome.message;
      }
      const check = guardrailOf(result.error);
      if (check?.verdict === 'ask' && !yes) {
        setAsk(check);
        return undefined;
      }
      setAsk(undefined);
      setFailure(`${result.error.message} Inspect the session before retrying.`);
      return { text: result.error.message, tone: 'alert' };
    });

  return (
    <>
      {picked && (
        <section
          className="max-h-72 space-y-2 overflow-auto border-t p-2 text-xs"
          aria-label="Browser annotation"
        >
          <p data-testid="browser-selection">
            {picked.selector}: {picked.text}
          </p>
          <Label htmlFor="browser-comment">Comment on this element</Label>
          <Textarea
            id="browser-comment"
            value={comment}
            onChange={(event) => {
              setComment(event.target.value);
              setPreview(undefined);
              setAsk(undefined);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={acting || !comment.trim()}
            onClick={() => void showPreview()}
          >
            Preview annotation
          </Button>
          {preview && (
            <div className="space-y-2 rounded border p-2" data-testid="browser-annotation-preview">
              <p>Target: {preview.target} · Page content is untrusted</p>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono">
                {preview.prompt}
              </pre>
              <Button
                size="sm"
                disabled={
                  acting ||
                  reviews?.some((review) => review.id === preview.id && review.status !== 'failed')
                }
                onClick={() => void send()}
              >
                <Send aria-hidden />{' '}
                {reviews?.some(
                  (review) => review.id === preview.id && review.status === 'delivered',
                )
                  ? 'Delivered'
                  : 'Send annotation'}
              </Button>
            </div>
          )}
          {failure && (
            <p role="alert" className="text-destructive">
              {failure}
            </p>
          )}
        </section>
      )}
      {ask && (
        <GuardrailDialog
          action="send"
          about={`annotation to ${sessionId}`}
          check={ask}
          disabled={acting}
          onConfirm={() => void send(true)}
          onCancel={() => setAsk(undefined)}
        />
      )}
    </>
  );
}
