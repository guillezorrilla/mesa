import type { ProjectRow, SavedPrompt, Shortcuts, TreeRow } from '@mesa/core';
import { type CommandId, projectLabel, type SearchHit, searchWorkspace } from '@mesa/core/browser';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Kbd } from '@/components/Kbd';
import { Muted } from '@/components/Muted';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { StateBadge } from '@/features/sessions/StateBadge';
import { hitIcon } from './hitIcon';

/** The full command palette, or the Session switcher: the palette listing only sessions. */
export type PaletteMode = 'all' | 'sessions';

const HEADINGS: Record<SearchHit['kind'], string> = {
  navigation: 'Navigation',
  action: 'Actions',
  setting: 'Settings',
  project: 'Projects',
  session: 'Recent sessions',
  prompt: 'Saved prompts',
  vault: 'Vault',
};

/** Core returns each kind's hits together: runs of one kind, in core's order. */
const groups = (hits: SearchHit[]) =>
  hits.reduce<[SearchHit, ...SearchHit[]][]>((runs, hit) => {
    const last = runs.at(-1);
    if (last?.[0].kind === hit.kind) last.push(hit);
    else runs.push([hit]);
    return runs;
  }, []);

/**
 * A keyboard-first view of the index `mesa search` prints, in the order core ranks it; in
 * `sessions` mode, the Session switcher. Switch session and Backspace on an empty query move
 * between the two.
 */
export function CommandPalette(props: {
  mode: PaletteMode | undefined;
  onMode: (mode: PaletteMode) => void;
  onClose: () => void;
  onSelect: (hit: SearchHit) => void;
  projects: readonly ProjectRow[];
  sessions: readonly TreeRow[];
  prompts?: readonly SavedPrompt[];
  shortcuts: Shortcuts;
  returnFocus: HTMLElement | null;
}) {
  const switcher = props.mode === 'sessions';
  const [query, setQuery] = useState('');
  // Closed by choosing a hit: focus stays where its action puts it, not back on the trigger.
  const chosen = useRef(false);
  useEffect(() => {
    if (props.mode) {
      setQuery('');
      chosen.current = false;
    }
  }, [props.mode]);
  useEffect(() => {
    if (!props.mode && !chosen.current) props.returnFocus?.focus();
  }, [props.mode, props.returnFocus]);
  const hits = searchWorkspace(props.projects, props.sessions, query, {
    prompts: props.prompts,
    shortcuts: props.shortcuts,
    sessionsOnly: switcher,
  });
  const choose = (hit: SearchHit) => {
    if (hit.id === ('switch-session' satisfies CommandId)) return props.onMode('sessions');
    chosen.current = true;
    // Closed first, so the focus trap is gone before the action moves focus.
    flushSync(props.onClose);
    props.onSelect(hit);
  };
  const empty = switcher ? !hits.length : hits.every((hit) => hit.kind === 'vault');
  return (
    <Dialog open={props.mode !== undefined} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        data-testid="command-palette"
        data-mode={props.mode}
        showCloseButton={false}
        aria-describedby={undefined}
        className="top-[15%] flex max-h-[min(72vh,640px)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!chosen.current) props.returnFocus?.focus();
        }}
      >
        <DialogTitle className="sr-only">{switcher ? 'Switch session' : 'Search Mesa'}</DialogTitle>
        {/* Keyed by mode, so a switch starts with its first row selected. */}
        <Command key={props.mode} shouldFilter={false} className="min-h-0 flex-1 bg-background">
          <div className="flex items-center border-b pr-4 [&_[data-slot=command-input-wrapper]]:h-14 [&_[data-slot=command-input-wrapper]]:flex-1 [&_[data-slot=command-input-wrapper]]:border-0 [&_[data-slot=command-input-wrapper]]:px-4">
            <CommandInput
              // A mode switch remounts the input: it takes the focus back for typing.
              autoFocus
              data-testid="palette-query"
              aria-label={switcher ? 'Switch to a session' : 'Search Mesa'}
              value={query}
              onValueChange={setQuery}
              placeholder={
                switcher
                  ? 'Switch to a session...'
                  : 'Search commands, settings, projects, sessions...'
              }
              className="h-14 text-base"
              onKeyDown={(event) => {
                if (switcher && event.key === 'Backspace' && !query) {
                  event.preventDefault();
                  props.onMode('all');
                }
              }}
            />
            <Kbd>esc</Kbd>
          </div>
          <CommandList className="max-h-none min-h-24 flex-1 p-2" aria-label="Search results">
            {empty && (
              <Muted data-testid="palette-empty" className="p-4 text-center">
                {switcher
                  ? query
                    ? 'No session matches.'
                    : 'No open sessions.'
                  : 'No matches. Try a project, session, or action.'}
              </Muted>
            )}
            {groups(hits).map((group) => (
              <CommandGroup
                key={group[0].kind}
                heading={switcher ? 'Sessions' : HEADINGS[group[0].kind]}
                className="[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
              >
                {group.map((hit) => (
                  <PaletteRow
                    key={`${hit.kind}:${hit.id}`}
                    hit={hit}
                    session={
                      switcher ? props.sessions.find((session) => session.id === hit.id) : undefined
                    }
                    onChoose={() => choose(hit)}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-muted-foreground text-xs">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>enter</Kbd> select
            </span>
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd> close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** A hit as an icon over two lines: its label, and its detail and key; a switcher row its state. */
function PaletteRow(props: { hit: SearchHit; session?: TreeRow; onChoose: () => void }) {
  const { hit, session } = props;
  const Icon = hitIcon(hit);
  return (
    <CommandItem
      value={`${hit.kind}:${hit.id}`}
      disabled={hit.disabled}
      data-testid="palette-hit"
      onSelect={props.onChoose}
      className="group gap-3 rounded-md px-2 py-2"
    >
      <Icon
        aria-hidden
        className="size-[18px] text-muted-foreground group-data-[selected=true]:text-state-waiting"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-foreground/80 group-data-[selected=true]:text-foreground">
          {hit.label}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs">
          <span className="truncate">
            {session
              ? [projectLabel(session.project ?? null), session.agent].join(' · ')
              : hit.detail}
          </span>
          {hit.shortcut && (
            <span data-testid="palette-shortcut" className="flex shrink-0 items-center gap-1">
              {' • '}
              <Kbd shortcut={hit.shortcut} />
            </span>
          )}
        </span>
      </span>
      {session && <StateBadge state={session.lastState.state} />}
      <Kbd className="hidden group-data-[selected=true]:inline-flex">enter</Kbd>
    </CommandItem>
  );
}
