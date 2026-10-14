import type { PrDetail, PrDraft } from '@mesa/core';
import { commentPlace } from '@mesa/core/browser';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Stat } from '@/components/Stat';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TABS = ['comments', 'drafts', 'files'] as const;
type DetailTab = (typeof TABS)[number];

/** Drafts when there are any, else my comments when there are any, else the files. */
const firstTab = (pr: PrDetail): DetailTab =>
  pr.drafts.length ? 'drafts' : pr.threads.length ? 'comments' : 'files';

/**
 * The PR's detail under its status: my threads with the author's last reply, my Pending drafts
 * (each can be discarded), and the changed files. Provider text is shown as plain text.
 */
export function PrDetailPanel(props: {
  pr: PrDetail;
  onDiscard: (draft: PrDraft) => void;
  /** The tab last picked on this PR, kept by the app across visits; else the first that has items. */
  tab?: string;
  onTab?: (tab: DetailTab) => void;
}) {
  const { pr } = props;
  const [chosen, setChosen] = useState<DetailTab | undefined>(() =>
    TABS.find((name) => name === props.tab),
  );
  const tab = chosen ?? firstTab(pr);
  const choose = (name: DetailTab) => {
    setChosen(name);
    props.onTab?.(name);
  };
  const tabs: [DetailTab, string, number][] = [
    ['comments', 'Your comments', pr.threads.length],
    ['drafts', 'Drafts', pr.drafts.length],
    ['files', 'Files', pr.files.length],
  ];
  return (
    <div className="space-y-1">
      <div role="tablist" aria-label="Pull request detail" className="flex gap-6 border-b">
        {tabs.map(([name, label, n]) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className="-mb-px border-b-2 border-transparent pb-2.5 text-muted-foreground text-sm hover:text-foreground aria-selected:border-foreground aria-selected:font-medium aria-selected:text-foreground"
            onClick={() => choose(name)}
          >
            {label}
            <span className="ml-1.5 text-muted-foreground tabular-nums">{n}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" data-testid={`pr-tab-${tab}`}>
        {tab === 'comments' &&
          (pr.threads.length ? (
            pr.threads.map((t) => (
              <Item
                key={t.id}
                where={commentPlace(t)}
                aside={<ThreadState resolved={t.resolved} verdict={t.verdict?.state} />}
              >
                <p className="whitespace-pre-wrap">{t.body}</p>
                {t.lastReply && (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
                    <span className="font-medium text-foreground">{t.lastReply.author}:</span>{' '}
                    {t.lastReply.body}
                  </p>
                )}
              </Item>
            ))
          ) : (
            <Muted className="py-4">You have no comments on this PR yet.</Muted>
          ))}
        {tab === 'drafts' &&
          (pr.drafts.length ? (
            pr.drafts.map((d) => (
              <Item
                key={d.id}
                where={commentPlace(d)}
                aside={
                  <Button variant="ghost" size="xs" onClick={() => props.onDiscard(d)}>
                    Discard
                  </Button>
                }
              >
                <p className="whitespace-pre-wrap">{d.body}</p>
              </Item>
            ))
          ) : (
            <Muted className="py-4">No pending drafts.</Muted>
          ))}
        {tab === 'files' &&
          (pr.files.length ? (
            pr.files.map((f) => (
              <div
                key={f.path}
                className="grid grid-cols-[1fr_auto] gap-4 border-b py-2 font-mono text-xs last:border-b-0"
              >
                <span className="truncate">{f.path}</span>
                <Stat added={f.additions} removed={f.deletions} />
              </div>
            ))
          ) : (
            <Muted className="py-4">No changed files.</Muted>
          ))}
      </div>
    </div>
  );
}

function Item(props: { where: string; aside: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 border-b py-3 text-sm last:border-b-0">
      <div className="min-w-0">
        <div className="mb-1 truncate font-mono text-muted-foreground text-xs">{props.where}</div>
        {props.children}
      </div>
      <div className="self-start">{props.aside}</div>
    </div>
  );
}

// A review round's verdict wins over the provider's resolved flag (CONTEXT.md, Comment verdict).
const THREAD_STATE = {
  addressed: { label: 'Addressed', text: 'text-state-idle', dot: 'bg-state-idle' },
  partly: { label: 'Partly addressed', text: 'text-state-waiting', dot: 'bg-state-waiting' },
  not: { label: 'Not addressed', text: 'text-state-failed', dot: 'bg-state-failed' },
  resolved: { label: 'Resolved', text: 'text-state-idle', dot: 'bg-state-idle' },
  open: { label: 'Open', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
} as const;

function ThreadState(props: { resolved: boolean; verdict?: keyof typeof THREAD_STATE }) {
  const state = THREAD_STATE[props.verdict ?? (props.resolved ? 'resolved' : 'open')];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', state.text)}>
      <span className={cn('size-1.5 rounded-full', state.dot)} />
      {state.label}
    </span>
  );
}
