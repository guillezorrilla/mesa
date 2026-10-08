import { Send } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ResponseReview } from './useResponseReview';

/** The selected response's review: pick a passage, comment on it, preview, and send. */
export function ResponseReviewForm({ review }: { review: ResponseReview }) {
  const { selected, range, preview, acting } = review;
  if (!selected) return null;
  return (
    <div className="space-y-3">
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
        onSelect={(event) =>
          review.selectRange({
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          })
        }
      />
      <Muted size="xs">Selected characters: {range.end - range.start}</Muted>
      <Label htmlFor="review-comment">Comment</Label>
      <Textarea
        id="review-comment"
        value={review.comment}
        onChange={(event) => review.editComment(event.target.value)}
        placeholder="What should the agent change or check?"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={acting || range.end <= range.start || !review.comment.trim()}
        onClick={review.showPreview}
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
          <Button size="sm" disabled={acting || review.sent} onClick={() => review.send()}>
            <Send aria-hidden /> {review.delivered ? 'Delivered' : 'Send review'}
          </Button>
        </div>
      )}
      {review.failure && (
        <p role="alert" className="text-xs text-destructive">
          {review.failure}
        </p>
      )}
    </div>
  );
}
