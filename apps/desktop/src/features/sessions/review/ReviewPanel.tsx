import type { NativeResponse } from '@mesa/core';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCommand } from '@/lib/useCommand';
import { ChangeReviewPanel } from './ChangeReviewPanel';
import { ResponseReviewPanel } from './ResponseReviewPanel';

/**
 * The review pane beside the selected terminal: Responses, or Changes for a session with a
 * project, over the session's responses and saved review comments.
 */
export function ReviewPanel({
  sessionId,
  project,
  checkout,
  initialResponse,
}: {
  sessionId: string;
  project?: string;
  checkout?: string;
  initialResponse?: NativeResponse;
}) {
  const responses = useCommand('review.responses', { id: sessionId });
  const [mode, setMode] = useState<'responses' | 'changes'>('responses');
  return (
    <aside
      aria-label="Response review"
      className="flex h-full min-h-0 w-[24rem] shrink-0 flex-col border-l bg-card"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={mode === 'responses' ? 'secondary' : 'ghost'}
            onClick={() => setMode('responses')}
          >
            Responses
          </Button>
          {project && (
            <Button
              size="sm"
              variant={mode === 'changes' ? 'secondary' : 'ghost'}
              onClick={() => setMode('changes')}
            >
              Changes
            </Button>
          )}
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh responses"
          onClick={() => void responses.refresh()}
        >
          <RefreshCw aria-hidden />
        </Button>
      </div>
      {mode === 'changes' && project && (
        <ChangeReviewPanel
          sessionId={sessionId}
          project={project}
          checkout={checkout}
          reviews={responses.data?.reviews ?? []}
          onSaved={() => void responses.refresh()}
        />
      )}
      <ResponseReviewPanel
        sessionId={sessionId}
        responses={responses}
        initialResponse={initialResponse}
        shown={mode === 'responses'}
      />
    </aside>
  );
}
