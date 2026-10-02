import type { ProjectRow, SavedPrompt, TreeRow } from '@mesa/core';
import { type SearchHit, searchWorkspace } from '@mesa/core/browser';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Muted } from '@/components/Muted';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const GROUPS: { kind: SearchHit['kind']; label: string }[] = [
  { kind: 'action', label: 'Actions' },
  { kind: 'setting', label: 'Settings' },
  { kind: 'project', label: 'Projects' },
  { kind: 'session', label: 'Recent sessions' },
  { kind: 'prompt', label: 'Saved prompts' },
  { kind: 'vault', label: 'Vault' },
];

/** A keyboard-first view of the same project/session/action index exposed by `mesa search`. */
export function CommandPalette(props: {
  open: boolean;
  onClose: () => void;
  onSelect: (hit: SearchHit) => void;
  projects: readonly ProjectRow[];
  sessions: readonly TreeRow[];
  prompts?: readonly SavedPrompt[];
  returnFocus: HTMLElement | null;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // Closed by choosing a hit: focus stays where its action puts it, not back on the trigger.
  const chosen = useRef(false);
  useEffect(() => {
    if (props.open) {
      setQuery('');
      setActive(0);
      chosen.current = false;
    }
  }, [props.open]);
  useEffect(() => {
    if (!props.open && !chosen.current) props.returnFocus?.focus();
  }, [props.open, props.returnFocus]);
  const hits = searchWorkspace(props.projects, props.sessions, query, props.prompts);
  const enabled = hits.filter((hit) => !hit.disabled);
  const selected = enabled[Math.min(active, enabled.length - 1)];
  const choose = (hit: SearchHit) => {
    if (hit.disabled) return;
    chosen.current = true;
    // Closed first, so the focus trap is gone before the action moves focus.
    flushSync(props.onClose);
    props.onSelect(hit);
  };
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        data-testid="command-palette"
        showCloseButton={false}
        className="top-[20%] max-h-[min(70vh,640px)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!chosen.current) props.returnFocus?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) =>
              enabled.length
                ? (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
                : 0,
            );
          } else if (
            event.key === 'Enter' &&
            selected &&
            event.target instanceof HTMLInputElement
          ) {
            event.preventDefault();
            choose(selected);
          }
        }}
      >
        <DialogTitle className="sr-only">Search Mesa</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4">
          <Search aria-hidden className="size-4 text-muted-foreground" />
          <Input
            data-testid="palette-query"
            aria-label="Search Mesa"
            autoFocus
            value={query}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setActive(0);
            }}
            placeholder="Search Mesa"
            className="h-12 border-0 px-0 shadow-none focus-visible:ring-0"
          />
          <kbd className="text-muted-foreground text-xs">Esc</kbd>
        </div>
        <div className="min-h-24 overflow-y-auto p-2" role="listbox" aria-label="Search results">
          {hits.every((hit) => hit.kind === 'vault') && (
            <p
              data-testid="palette-empty"
              className="p-4 text-center text-muted-foreground text-sm"
            >
              No matches. Try a project, session, or action.
            </p>
          )}
          {GROUPS.map(({ kind, label }) => {
            const group = hits.filter((hit) => hit.kind === kind);
            if (!group.length) return null;
            return (
              <fieldset key={kind} className="mb-2">
                <legend className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {label}
                </legend>
                {group.map((hit) => (
                  <button
                    key={`${hit.kind}-${hit.id}`}
                    type="button"
                    role="option"
                    data-testid="palette-hit"
                    aria-selected={hit === selected}
                    disabled={hit.disabled}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                      hit === selected && 'bg-accent',
                      hit.disabled && 'cursor-not-allowed opacity-50',
                    )}
                    onMouseEnter={() => !hit.disabled && setActive(enabled.indexOf(hit))}
                    onClick={() => choose(hit)}
                  >
                    <span className="truncate">{hit.label}</span>
                    <span className="truncate text-muted-foreground text-xs">{hit.detail}</span>
                  </button>
                ))}
              </fieldset>
            );
          })}
        </div>
        <Muted size="xs" className="border-t px-4 py-2">
          Arrows to choose · Enter to open · Escape to close
        </Muted>
      </DialogContent>
    </Dialog>
  );
}
