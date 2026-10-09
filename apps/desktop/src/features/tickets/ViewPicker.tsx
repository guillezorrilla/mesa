import { useEffect, useState } from 'react';
import { SourceError } from '@/features/projects/import/SourceError';
import { type CommandState, useCommand } from '@/lib/useCommand';

/** A board or saved filter a view can name. */
export type Pick = { id: string; name: string };

type Choice = Pick & { hint: string };

/** The choices as radio rows; the first is picked until the person picks another. */
function Choices(props: {
  label: string;
  read: CommandState<unknown>;
  choices: Choice[] | undefined;
  picked: Pick | undefined;
  onPick: (pick: Pick) => void;
}) {
  const { choices, picked, onPick } = props;
  const first = choices?.[0];
  useEffect(() => {
    if (!picked && first) onPick({ id: first.id, name: first.name });
  }, [picked, first, onPick]);
  // A token without the Jira Software scopes lands here: Reconnect signs in again and reloads.
  if (props.read.error && !choices)
    return <SourceError source="atlassian" error={props.read.error} onRetry={props.read.refresh} />;
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      className="max-h-44 divide-y overflow-auto rounded-lg border"
    >
      {choices?.map((c) => (
        <label
          key={c.id}
          htmlFor={`view-pick-${c.id}`}
          className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent/60"
        >
          <input
            id={`view-pick-${c.id}`}
            type="radio"
            name="view-pick"
            checked={picked?.id === c.id}
            onChange={() => onPick({ id: c.id, name: c.name })}
            className="accent-primary"
          />
          {c.name}
          <span className="ml-auto text-xs text-muted-foreground">{c.hint}</span>
        </label>
      ))}
      {choices && !choices.length && (
        <p className="px-3 py-2 text-sm text-muted-foreground">None found.</p>
      )}
    </div>
  );
}

function Boards(props: { search: string; picked: Pick | undefined; onPick: (p: Pick) => void }) {
  const read = useCommand('tickets.boards', { search: props.search });
  const choices = read.data?.boards.map((b) => ({
    id: String(b.id),
    name: b.name,
    hint: [b.type, b.project].filter(Boolean).join(', '),
  }));
  return (
    <Choices
      label="Boards"
      read={read}
      choices={choices}
      picked={props.picked}
      onPick={props.onPick}
    />
  );
}

function Filters(props: { search: string; picked: Pick | undefined; onPick: (p: Pick) => void }) {
  const read = useCommand('tickets.filters', { search: props.search });
  const choices = read.data?.filters.map((f) => ({ id: f.id, name: f.name, hint: '' }));
  return (
    <Choices
      label="Saved filters"
      read={read}
      choices={choices}
      picked={props.picked}
      onPick={props.onPick}
    />
  );
}

/** Search the site's boards, or its saved filters, and pick one. */
export function ViewPicker(props: {
  kind: 'board' | 'filter';
  picked: Pick | undefined;
  onPick: (pick: Pick) => void;
}) {
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const what = props.kind === 'board' ? 'boards' : 'saved filters';
  const List = props.kind === 'board' ? Boards : Filters;
  return (
    <div className="grid gap-2">
      <input
        id="ticket-view-search"
        type="search"
        aria-label={`Search ${what}`}
        placeholder={`Search ${what}`}
        value={typed}
        onChange={(event) => setTyped(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          setSearch(typed);
        }}
        onBlur={() => setSearch(typed)}
        className="rounded-md border bg-background px-3 py-1.5 text-sm"
      />
      <List search={search} picked={props.picked} onPick={props.onPick} />
    </div>
  );
}
