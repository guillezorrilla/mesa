import type { PrDetail, PrDraft } from '@mesa/core';
import { commentPlace } from '@mesa/core/browser';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Stat } from '@/components/Stat';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DetailTab = 'comments' | 'drafts' | 'files';

/** Drafts when there are any, else my comments when there are any, else the files. */
const firstTab = (pr: PrDetail): DetailTab =>
  pr.drafts.length ? 'drafts' : pr.threads.length ? 'comments' : 'files';

/**
 * The PR's detail under its status: my threads with the author's last reply, my Pending drafts
 * (each can be discarded), and the changed files. Provider text is shown as plain text.
 */
export function PrDetailPanel(props: { pr: PrDetail; onDiscard: (draft: PrDraft) => void }) {
  const { pr } = props;
  const [chosen, setChosen] = useState<DetailTab>();
  const tab = chosen ?? firstTab(pr);
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
            onClick={() => setChosen(name)}
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
              <Item key={t.id} where={commentPlace(t)} aside={<Resolved resolved={t.resolved} />}>
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

function Resolved(props: { resolved: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        props.resolved ? 'text-state-idle' : 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          props.resolved ? 'bg-state-idle' : 'bg-muted-foreground',
        )}
      />
      {props.resolved ? 'Resolved' : 'Open'}
    </span>
  );
}
