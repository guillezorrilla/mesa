import type { PrDetail } from '@mesa/core';
import { FileCode2, MessageSquareText } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { folderOf, nameOf } from '@/features/git/gitChanges';
import { cn } from '@/lib/utils';

type Thread = PrDetail['threads'][number];

/**
 * My threads on a PR as a conversation each: where it sits, my comment, and the author's last
 * reply on one rail, edged in the thread's state. Provider text is shown as plain text.
 */
export function PrCommentsTab(props: { threads: readonly Thread[] }) {
  if (!props.threads.length)
    return <Muted className="py-4">You have no comments on this PR yet.</Muted>;
  return (
    <ul className="space-y-3 py-3">
      {props.threads.map((thread) => (
        <ThreadCard key={thread.id} thread={thread} />
      ))}
    </ul>
  );
}

function ThreadCard({ thread }: { thread: Thread }) {
  const state = THREAD_STATE[thread.verdict?.state ?? (thread.resolved ? 'resolved' : 'open')];
  const tone = TONE[state.tone];
  return (
    <li className={cn('overflow-hidden rounded-lg border border-l-2 bg-card', tone.edge)}>
      <header className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <FileCode2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-mono text-xs" title={thread.path}>
          <span className="text-muted-foreground">{folderOf(thread.path)}</span>
          <span className="font-medium text-foreground">{nameOf(thread.path)}</span>
          {thread.line && <span className="text-muted-foreground">:{thread.line}</span>}
        </span>
        <Badge variant="secondary" className={cn('ml-auto', tone.pill)}>
          <span className={cn('size-1.5 rounded-full', tone.dot)} />
          {state.label}
        </Badge>
      </header>
      <div className="px-3 py-3">
        <Comment who="You" body={thread.body} rail={!!thread.lastReply} />
        {thread.lastReply ? (
          <Comment who={thread.lastReply.author} body={thread.lastReply.body} note="latest reply" />
        ) : (
          <p className="flex items-center gap-1.5 pl-8 text-muted-foreground text-xs">
            <MessageSquareText aria-hidden className="size-3.5" />
            No reply yet
          </p>
        )}
      </div>
    </li>
  );
}

/** One comment beside its author's initials; `rail` runs a line down to the next comment. */
function Comment(props: { who: string; body: string; note?: string; rail?: boolean }) {
  return (
    <div className="relative flex gap-2.5 pb-3 last:pb-0">
      {props.rail && (
        <span
          aria-hidden
          className="absolute top-7 bottom-0 left-3 w-px -translate-x-1/2 bg-border"
        />
      )}
      <PersonAvatar name={props.who} className="size-6" />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-xs">
          <span className="font-medium text-foreground">{props.who}</span>
          {props.note && <span className="text-muted-foreground"> · {props.note}</span>}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{props.body}</p>
      </div>
    </div>
  );
}

// A review round's verdict wins over the provider's resolved flag (CONTEXT.md, Comment verdict).
const THREAD_STATE = {
  addressed: { label: 'Addressed', tone: 'idle' },
  partly: { label: 'Partly addressed', tone: 'waiting' },
  not: { label: 'Not addressed', tone: 'failed' },
  resolved: { label: 'Resolved', tone: 'idle' },
  open: { label: 'Open', tone: 'muted' },
} as const;

// Literal class names, so Tailwind finds them.
const TONE = {
  idle: {
    edge: 'border-l-state-idle',
    pill: 'bg-state-idle/15 text-state-idle',
    dot: 'bg-state-idle',
  },
  waiting: {
    edge: 'border-l-state-waiting',
    pill: 'bg-state-waiting/15 text-state-waiting',
    dot: 'bg-state-waiting',
  },
  failed: {
    edge: 'border-l-state-failed',
    pill: 'bg-state-failed/15 text-state-failed',
    dot: 'bg-state-failed',
  },
  muted: {
    edge: 'border-l-muted-foreground/60',
    pill: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
  },
} as const;
