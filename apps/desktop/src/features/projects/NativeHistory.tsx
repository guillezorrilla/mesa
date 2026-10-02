import type { ConversationSearch, NativeHistoryRow } from '@mesa/core';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/** Native conversations in this project's checkout, with an explicit import action. */
export function NativeHistory(props: { project: string; onSession: (id: string) => void }) {
  const history = useCommand('sessions.history', { project: props.project });
  const run = useRun();
  const { act, acting } = useAct();
  const [selected, setSelected] = useState<NativeHistoryRow>();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<ConversationSearch>();
  const search = () =>
    act(async () => {
      const result = await run('sessions.search', { project: props.project, query });
      if (result) setMatches(result);
      return undefined;
    });
  const importSession = () =>
    act(async () => {
      if (!selected) return undefined;
      const adopted = await run('sessions.adopt', {
        agentSessionId: selected.id,
        project: props.project,
      });
      if (!adopted) return undefined;
      setSelected(undefined);
      await history.refresh();
      props.onSession(adopted.id);
      return said(`Imported ${selected.agent} session as ${adopted.id}`, adopted);
    });
  return (
    <div
      data-testid="native-history"
      className="space-y-2 rounded-lg border bg-card/35 p-3 text-sm"
    >
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <Label htmlFor="native-history-query" className="sr-only">
          Search conversation text
        </Label>
        <Input
          id="native-history-query"
          data-testid="native-history-query"
          value={query}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setMatches(undefined);
          }}
          minLength={2}
          maxLength={200}
          placeholder="Search conversation text..."
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={acting || query.trim().length < 2}
        >
          Search
        </Button>
      </form>
      {matches && (
        <div data-testid="native-history-results" className="space-y-1 border-b pb-2">
          <Muted size="xs">
            {matches.hits.length} matches in {matches.filesSearched} conversations
            {matches.truncated ? ' · partial results' : ''}
          </Muted>
          {matches.hits.map((hit) => (
            <button
              key={`${hit.agent}:${hit.id}:${hit.at}:${hit.excerpt}`}
              type="button"
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
              onClick={() => {
                const row = history.data?.rows.find(
                  (item) => item.agent === hit.agent && item.id === hit.id,
                );
                if (row?.importedAs) props.onSession(row.importedAs);
                else if (row && !row.heldElsewhere) setSelected(row);
              }}
            >
              <span className="font-mono">
                {hit.agent} · {hit.id} · {hit.role}
              </span>
              <span className="block truncate text-muted-foreground">{hit.excerpt}</span>
            </button>
          ))}
        </div>
      )}
      {history.busy && !history.data && <p className="text-muted-foreground">Loading history…</p>}
      {history.data?.rows.map((row) => (
        <div
          key={`${row.agent}:${row.id}`}
          className="flex items-center gap-3 border-b py-2 last:border-b-0"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={row.cwd}>
            {row.agent} · {row.id}
          </span>
          <time className="text-xs text-muted-foreground" dateTime={row.updatedAt}>
            {new Date(row.updatedAt).toLocaleDateString()}
          </time>
          {row.importedAs ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => row.importedAs && props.onSession(row.importedAs)}
            >
              Open
            </Button>
          ) : row.heldElsewhere ? (
            <span className="text-xs text-muted-foreground">Other profile</span>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setSelected(row)}>
              Import
            </Button>
          )}
        </div>
      ))}
      {history.data?.rows.length === 0 && (
        <p className="text-muted-foreground">No native conversations found in this checkout.</p>
      )}
      {history.data && history.data.total > history.data.rows.length && (
        <Muted size="xs">
          Showing the newest {history.data.rows.length} of {history.data.total}.
        </Muted>
      )}
      {history.data?.unsupported.map((item) => (
        <p key={item.agent} className="text-xs text-muted-foreground">
          {item.agent} history unavailable: {item.reason}
        </p>
      ))}
      {selected && (
        <ActionDialog
          testId="native-import-dialog"
          title={`Import ${selected.agent} session?`}
          description="End the session in its original terminal first. Two agents writing one native conversation can interleave its transcript."
          submit={{ label: 'Import and resume', testId: 'native-import-submit', disabled: acting }}
          onSubmit={() => void importSession()}
          onCancel={() => setSelected(undefined)}
        >
          <p className="font-mono text-xs">{selected.id}</p>
        </ActionDialog>
      )}
    </div>
  );
}
