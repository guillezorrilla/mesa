import { answerParts } from '@mesa/core/browser';
import { Copy, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { citedParts } from './cloudLines';
import { useCloudCopy } from './useCloudCopy';

/**
 * An answer from the cloud-logs agent: its text with each cited entry a button that shows it, and a
 * query it suggests with Apply query and Copy query.
 */
export function AskAnswer(props: {
  answer: string;
  cited: readonly string[];
  onCite?: (id: string) => void;
  onApply?: (query: string) => void;
}) {
  const { text, query } = answerParts(props.answer);
  const { copyText } = useCloudCopy();
  return (
    <div className="grid gap-2">
      <p className="whitespace-pre-wrap text-sm leading-6">
        {citedParts(text, new Set(props.cited)).map((part, i) =>
          'id' in part ? (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed answer
              key={i}
              type="button"
              title="Show this entry"
              className="mx-0.5 rounded bg-state-working/15 px-1 font-mono text-[11px] hover:bg-state-working/25 focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => props.onCite?.(part.id)}
            >
              {part.id.slice(0, 8)}
            </button>
          ) : (
            part.text
          ),
        )}
      </p>
      {query && (
        <div className="grid gap-1.5 rounded-md border bg-muted/30 p-2">
          <code className="font-mono text-[11px] [overflow-wrap:anywhere]">{query}</code>
          <span className="flex gap-1">
            {props.onApply && (
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => props.onApply?.(query)}
              >
                <Play aria-hidden /> Apply query
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => copyText(query, 'query')}
            >
              <Copy aria-hidden /> Copy query
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
