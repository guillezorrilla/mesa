import { useCommand } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { KIND_ICONS } from './VaultTree';

/**
 * `mesa vault search` for `text` under the screen's project and type filters: each item with its
 * numbered snippets, newest first after those whose path names every word. One selects its item.
 */
export function VaultSearchResults(props: {
  text: string;
  project?: string;
  type?: string;
  selected?: string;
  onSelect: (path: string) => void;
}) {
  const found = useCommand('vault.search', {
    text: props.text,
    project: props.project,
    type: props.type,
  });
  const data = found.data;
  const what = `"${props.text}"${props.project || props.type ? ' under these filters' : ''}`;
  // A search that fails says why in a toast, and leaves no results.
  const said = !data
    ? found.busy && 'Searching the vault...'
    : data.total === 0
      ? `No items match ${what}.`
      : `${data.total} ${data.total === 1 ? 'item matches' : 'items match'} ${what}.` +
        (data.truncated ? ` Showing the first ${data.items.length}.` : '');
  return (
    <section
      aria-label="Vault search results"
      data-testid="vault-results"
      className="max-h-[36rem] min-w-0 overflow-auto rounded-lg border bg-card/40 p-1"
    >
      {said && (
        <p data-testid="vault-results-said" className="p-2 text-xs text-muted-foreground">
          {said}
        </p>
      )}
      {data?.items.map((hit) => {
        const Icon = KIND_ICONS[hit.kind];
        return (
          <button
            key={hit.path}
            type="button"
            data-testid="vault-result"
            aria-pressed={props.selected === hit.path}
            title={hit.path}
            className={cn(
              'block w-full min-w-0 rounded px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
              props.selected === hit.path && 'bg-accent',
            )}
            onClick={() => props.onSelect(hit.path)}
          >
            <span className="flex min-w-0 items-center gap-2 font-medium">
              <Icon aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{hit.title}</span>
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">{hit.path}</span>
            {hit.matches.map((match) => (
              <span
                key={match.line}
                data-testid="vault-snippet"
                className="mt-0.5 flex gap-2 font-mono text-[11px] leading-4"
              >
                <span className="shrink-0 text-muted-foreground">{match.line}</span>
                <span className="min-w-0 break-words">{match.text}</span>
              </span>
            ))}
          </button>
        );
      })}
    </section>
  );
}
