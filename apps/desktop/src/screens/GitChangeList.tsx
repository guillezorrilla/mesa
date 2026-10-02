import { ChevronDown, ChevronRight, Folder, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { CountPill } from '@/components/CountPill';
import { cn } from '@/lib/utils';
import {
  byFolder,
  type GitEntry,
  type GitSection,
  type GitSelection,
  glyph,
  isSelected,
  nameOf,
} from './gitChanges';

type IndexAction = (action: 'stage' | 'unstage', paths: string[]) => void;

/** The Staged and Changes sections, each folded by folder, with per-row and whole-section staging. */
export function GitChangeList(props: {
  sections: GitSection[];
  /** The profile's file tree text size in px. */
  fontSize: number;
  selected?: GitSelection;
  acting: boolean;
  onSelect: (entry: GitEntry) => void;
  onIndex: IndexAction;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setClosed((last) => {
      const next = new Set(last);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return props.sections.map((section) => (
    <div key={section.title}>
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
        <Disclosure open={!closed.has(section.title)} onToggle={() => toggle(section.title)}>
          {section.title}
          <CountPill count={section.entries.length} />
        </Disclosure>
        <button
          type="button"
          className="ml-auto text-xs font-normal text-muted-foreground hover:text-foreground disabled:opacity-50"
          disabled={props.acting}
          onClick={() =>
            props.onIndex(
              section.action,
              section.entries.map((entry) => entry.change.path),
            )
          }
        >
          {section.action === 'stage' ? 'Stage all' : 'Unstage all'}
        </button>
      </div>
      {!closed.has(section.title) &&
        byFolder(section.entries).map(([folder, entries]) => {
          const key = `${section.title}:${folder}`;
          return (
            <div key={key} style={{ fontSize: props.fontSize }}>
              {folder && (
                <Disclosure
                  open={!closed.has(key)}
                  onToggle={() => toggle(key)}
                  className="w-full gap-1.5 px-4 py-1 hover:bg-accent/50"
                >
                  <Folder aria-hidden className="size-3.5" />
                  <span className="truncate">{folder}</span>
                  <span className="ml-auto">{entries.length}</span>
                </Disclosure>
              )}
              {!closed.has(key) &&
                entries.map((entry) => (
                  <ChangeRow
                    key={entry.change.path}
                    entry={entry}
                    nested={Boolean(folder)}
                    active={isSelected(entry, props.selected)}
                    acting={props.acting}
                    onSelect={props.onSelect}
                    onIndex={props.onIndex}
                  />
                ))}
            </div>
          );
        })}
    </div>
  ));
}

/** A chevron button that folds what follows it. */
function Disclosure(props: {
  open: boolean;
  onToggle: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const Chevron = props.open ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      aria-expanded={props.open}
      className={cn(
        'flex items-center gap-2 text-muted-foreground hover:text-foreground',
        props.className,
      )}
      onClick={props.onToggle}
    >
      <Chevron aria-hidden className="size-4" />
      {props.children}
    </button>
  );
}

/** One changed file: its status glyph and name, and a hover button to stage or unstage it. */
function ChangeRow(props: {
  entry: GitEntry;
  nested: boolean;
  active: boolean;
  acting: boolean;
  onSelect: (entry: GitEntry) => void;
  onIndex: IndexAction;
}) {
  const { change, staged } = props.entry;
  const [sign, tone] = glyph(props.entry.code);
  const verb = staged ? 'Unstage' : 'Stage';
  return (
    <div
      className={cn(
        'group flex items-center gap-1 pr-2 hover:bg-accent/50',
        props.active && 'bg-accent',
      )}
    >
      <button
        type="button"
        aria-current={props.active || undefined}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left',
          props.nested ? 'pl-9' : 'pl-5',
        )}
        title={change.oldPath ? `${change.oldPath} -> ${change.path}` : change.path}
        onClick={() => props.onSelect(props.entry)}
      >
        <span className={cn('w-3 shrink-0 font-mono', tone)}>{sign}</span>
        <span className="truncate">{nameOf(change.path)}</span>
      </button>
      <button
        type="button"
        aria-label={`${verb} ${change.path}`}
        title={verb}
        disabled={props.acting}
        className="rounded p-1 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        onClick={() => props.onIndex(staged ? 'unstage' : 'stage', [change.path])}
      >
        {staged ? (
          <Minus aria-hidden className="size-3.5" />
        ) : (
          <Plus aria-hidden className="size-3.5" />
        )}
      </button>
    </div>
  );
}
