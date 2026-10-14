import { useEffect, useState } from 'react';
import { SourceError } from '@/features/projects/import/SourceError';
import { type CommandState, useCommand } from '@/lib/useCommand';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { type Choice, ChoiceRows } from './ChoiceRows';

/** A board or saved filter a view can name. */
export type Pick = { id: string; name: string };

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
    <ChoiceRows
      label={props.label}
      name="view-pick"
      choices={choices}
      picked={picked?.id}
      onPick={(c) => onPick({ id: c.id, name: c.name })}
    />
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
  // Asks the tracker once the person pauses typing.
  const search = useDebouncedValue(typed.trim());
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
        className="rounded-md border bg-background px-3 py-1.5 text-sm"
      />
      <List search={search} picked={props.picked} onPick={props.onPick} />
    </div>
  );
}
