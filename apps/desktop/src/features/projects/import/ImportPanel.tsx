import type { ImportResult } from '@mesa/core';
import { Download, ExternalLink, FolderTree, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { type Message, said } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { SourcePickerDialog } from './SourcePickerDialog';

/** What an import says when it ends: what came in, and why no notes were written if none were. */
function outcome(result: ImportResult & { warning?: string }): Message {
  const what = `Imported ${result.items.map((item) => item.title).join(', ')}`;
  if (result.notes && !result.notes.ok) {
    return { text: `${what}; notes not written: ${result.notes.reason}`, tone: 'alert' };
  }
  return said(what, result);
}

/**
 * A project's Import panel (CONTEXT.md, Import): paste a Jira, Confluence, or web link to import
 * it into the project's vault, or Browse Atlassian to tick items in the Picker, with or without
 * Write notes, and its imported items, each with Refresh and Open in Obsidian (its note, else its
 * latest snapshot).
 */
export function ImportPanel(props: { project: string }) {
  const { project } = props;
  const list = useCommand('imports.list', { project });
  const run = useRun();
  const { acting, act } = useAct();
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState(true);
  const [browsing, setBrowsing] = useState(false);
  const settle = async (result: (ImportResult & { warning?: string }) | undefined) => {
    await list.refresh();
    return result && outcome(result);
  };
  /** Imports `links`; false when the import did not run (its error toasted). */
  const add = async (links: string[]) => {
    let ran = false;
    await act(async () => {
      const result = await run('imports.add', { project, links, notes });
      ran = Boolean(result);
      return settle(result);
    });
    return ran;
  };
  const refresh = (id: string) =>
    void act(async () => settle(await run('imports.refresh', { project, id, notes })));
  const items = list.data?.items ?? [];
  return (
    <section data-testid="import-panel" aria-label="Import" className="space-y-3">
      <SectionLabel className="flex items-center gap-2">
        <Download aria-hidden className="size-4" /> Import
      </SectionLabel>
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (link.trim()) void add([link.trim()]).then((ran) => ran && setLink(''));
        }}
      >
        <Input
          aria-label="Link to import"
          placeholder="Paste a Jira, Confluence, or web link"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          className="min-w-64 flex-1"
        />
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Switch checked={notes} onCheckedChange={setNotes} aria-label="Write notes" />
          Write notes
        </Label>
        <Button type="submit" size="sm" disabled={acting || !link.trim()}>
          {acting ? 'Importing...' : 'Import'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={acting}
          onClick={() => setBrowsing(true)}
        >
          <FolderTree aria-hidden /> Browse
        </Button>
      </form>
      {browsing && (
        <SourcePickerDialog
          source="atlassian"
          label="Atlassian"
          project={project}
          notes={notes}
          onNotesChange={setNotes}
          onImport={add}
          onClose={() => setBrowsing(false)}
        />
      )}
      {items.length === 0 ? (
        <Muted>Nothing imported yet.</Muted>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
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
                label={`Refresh ${item.id}`}
                icon={RefreshCw}
                disabled={acting}
                onClick={() => refresh(item.id)}
              />
              <IconButton
                label={`Open ${item.id} in Obsidian`}
                icon={ExternalLink}
                onClick={() => void run('vault.openNote', { note: item.note ?? item.snapshot })}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
