import type {
  ChangeReview as ChangeReviewData,
  ChangeReviewPreview,
  GuardrailCheck,
  SavedReview,
} from '@mesa/core';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { type Message, said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAct } from '@/lib/useAct';
import { useCall, useCommand } from '@/lib/useCommand';
import { GuardrailDialog, guardrailOf } from './GuardrailDialog';
import { reviewOutcome } from './reviewOutcome';

/** A selected session's Git file and hunk, rechecked before feedback reaches its agent. */
export function ChangeReview({
  sessionId,
  project,
  checkout,
  reviews,
  onSaved,
}: {
  sessionId: string;
  project: string;
  checkout?: string;
  reviews: SavedReview[];
  onSaved: () => void;
}) {
  const status = useCommand('git.status', { project, checkout });
  const call = useCall();
  const { act, acting } = useAct();
  const [change, setChange] = useState<ChangeReviewData>();
  const [staged, setStaged] = useState(false);
  const [hunk, setHunk] = useState<number>();
  const [comment, setComment] = useState('');
  const [preview, setPreview] = useState<ChangeReviewPreview>();
  const [ask, setAsk] = useState<GuardrailCheck>();
  const [failure, setFailure] = useState<string>();
  const reviewable = status.data?.changes.filter(
    (file) => file.index !== '?' && file.workingTree !== '?',
  );

  const load = (path: string, selectedStaged: boolean) =>
    act(async (): Promise<Message | undefined> => {
      setStaged(selectedStaged);
      setChange(undefined);
      setHunk(undefined);
      setPreview(undefined);
      setFailure(undefined);
      const result = await call('review.changes', { id: sessionId, path, staged: selectedStaged });
      if (!result.ok) return { text: result.error.message, tone: 'alert' };
      setChange(result.data);
      return undefined;
    });
  const selected = () =>
    change && hunk !== undefined
      ? {
          id: sessionId,
          profile: change.profile,
          path: change.path,
          staged: change.staged,
          source: change.source,
          revision: change.revision,
          hunk,
          comment,
        }
      : undefined;
  const showPreview = () =>
    act(async (): Promise<Message | undefined> => {
      const input = selected();
      if (!input) return undefined;
      const result = await call('review.changePreview', input);
      if (!result.ok) return { text: result.error.message, tone: 'alert' };
      setPreview(result.data);
      setFailure(undefined);
      return undefined;
    });
  const send = (yes = false) =>
    act(async (): Promise<Message | undefined> => {
      const input = selected();
      if (!input || !preview) return undefined;
      const result = await call('review.changeSend', { ...input, yes });
      if (result.ok) {
        onSaved();
        setAsk(undefined);
        if (result.data.status === 'delivered')
          return said(
            result.data.already ? 'Review was already delivered' : `Review sent to ${sessionId}`,
            result.data,
          );
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
      setFailure(`${result.error.message} Inspect the session before retrying.`);
      return { text: result.error.message, tone: 'alert' };
    });

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 text-sm">
      {reviewable?.length === 0 && (
        <p className="text-muted-foreground">No tracked changes to review in this checkout.</p>
      )}
      {reviewable?.map((file) => (
        <Button
          key={file.path}
          size="sm"
          variant={change?.path === file.path ? 'secondary' : 'ghost'}
          className="w-full justify-start truncate font-mono text-xs"
          onClick={() => void load(file.path, staged)}
        >
          {file.path}
        </Button>
      ))}
      {change && (
        <section className="space-y-3 border-t pt-3">
          <p className="break-all font-mono text-xs">{change.path}</p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={!staged ? 'secondary' : 'outline'}
              onClick={() => void load(change.path, false)}
            >
              Working
            </Button>
            <Button
              size="sm"
              variant={staged ? 'secondary' : 'outline'}
              onClick={() => void load(change.path, true)}
            >
              Staged
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {change.baseKind} {change.base.slice(0, 12)} · Patch {change.source.slice(0, 12)}
          </p>
          {change.hunks.length === 0 && (
            <p className="text-muted-foreground">No text hunks in this diff.</p>
          )}
          {change.hunks.map((row) => (
            <Button
              key={row.index}
              size="sm"
              variant={hunk === row.index ? 'secondary' : 'outline'}
              className="w-full justify-start truncate font-mono text-xs"
              onClick={() => {
                setHunk(row.index);
                setPreview(undefined);
              }}
            >
              {row.header}
            </Button>
          ))}
          {hunk !== undefined && (
            <>
              <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded border p-2 font-mono text-xs">
                {change.hunks[hunk]?.text}
              </pre>
              <Label htmlFor="change-review-comment">Comment on this hunk</Label>
              <Textarea
                id="change-review-comment"
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                  setPreview(undefined);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={acting || !comment.trim()}
                onClick={() => void showPreview()}
              >
                Preview review
              </Button>
            </>
          )}
          {preview && (
            <div className="space-y-2 rounded border p-2" data-testid="change-review-preview">
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
                  reviews.some((review) => review.id === preview.id && review.status !== 'failed')
                }
                onClick={() => void send()}
              >
                <Send aria-hidden />{' '}
                {reviews.some((review) => review.id === preview.id && review.status === 'delivered')
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
        </section>
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
    </div>
  );
}
