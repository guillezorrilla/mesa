import type { ImportListRow } from '@mesa/core';
import { ExternalLink, Play, RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { Badge } from '@/components/ui/badge';

/**
 * The project's imported items, each with Start session (from it), Refresh, and Open in Obsidian
 * (its note, else its latest snapshot), at the end of its row.
 */
export function ImportedItems(props: {
  items: ImportListRow[];
  acting: boolean;
  onRefresh: (id: string) => void;
  onOpen: (item: ImportListRow) => void;
  onStartSession: (id: string) => void;
}) {
  if (!props.items.length) return <Muted>Nothing imported yet.</Muted>;
  return (
    <ul className="divide-y rounded-lg border">
      {props.items.map((item) => (
        <li
          key={`${item.source}/${item.id}`}
          data-testid="import-item"
          className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-sm"
        >
          <Badge variant="secondary">{item.source}</Badge>
          <span className="min-w-0 flex-1 truncate" title={item.url}>
            {item.title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{item.fetched}</span>
          <IconButton
            label={`Start session from ${item.id}`}
            icon={Play}
            onClick={() => props.onStartSession(item.id)}
          />
          <IconButton
            label={`Refresh ${item.id}`}
            icon={RefreshCw}
            disabled={props.acting}
            onClick={() => props.onRefresh(item.id)}
          />
          <IconButton
            label={`Open ${item.id} in Obsidian`}
            icon={ExternalLink}
            onClick={() => props.onOpen(item)}
          />
        </li>
      ))}
    </ul>
  );
}
