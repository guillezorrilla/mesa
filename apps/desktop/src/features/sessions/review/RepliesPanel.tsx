import type { NativeResponse } from '@mesa/core';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCommand } from '@/lib/useCommand';
import { ChangeReviewPanel } from './ChangeReviewPanel';
import { RepliesTab } from './RepliesTab';

/**
 * The Replies pane beside the selected terminal: Replies, or Changes for a session with a
 * project, over the session's replies and saved review comments.
 */
export function RepliesPanel({
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
  const [mode, setMode] = useState<'replies' | 'changes'>('replies');
  return (
    <aside
      aria-label="Replies"
      className="flex h-full min-h-0 w-[24rem] shrink-0 flex-col border-l bg-card"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={mode === 'replies' ? 'secondary' : 'ghost'}
            onClick={() => setMode('replies')}
          >
            Replies
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
          aria-label="Refresh replies"
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
      <RepliesTab
        sessionId={sessionId}
        responses={responses}
        initialResponse={initialResponse}
        shown={mode === 'replies'}
      />
    </aside>
  );
}
