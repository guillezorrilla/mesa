import type { ImportResult, SourceRow } from '@mesa/core';
import { Download, Link, Plug } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { type Message, said } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { ImportedItems } from './ImportedItems';
import { PasteLinkForm } from './PasteLinkForm';
import { SourceCards } from './SourceCards';
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
 * A project's Import tab (CONTEXT.md, Import): each Source, to connect or Browse in the Picker;
 * a pasted link, a Source's or any public web page's; the Write notes toggle all of them share;
 * and the items the project imported. Start session, on an item or from the Picker, hands the
 * item (its id or link) to `onStartSession`.
 */
export function ImportTab(props: { project: string; onStartSession: (from: string) => void }) {
  const { project } = props;
  const list = useCommand('imports.list', { project });
  const sources = useCommand('sources.list');
  const run = useRun();
  const { acting, act } = useAct();
  const [notes, setNotes] = useState(true);
  const [browsing, setBrowsing] = useState<SourceRow>();
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
  return (
    <div data-testid="import-tab" className="space-y-8">
      <section aria-label="Sources" className="space-y-3">
        <SectionLabel className="flex items-center gap-2">
          <Plug aria-hidden className="size-4" /> Sources
        </SectionLabel>
        <Muted>Browse a connected source and tick the pages and issues to import.</Muted>
        <SourceCards sources={sources} acting={acting} act={act} onBrowse={setBrowsing} />
      </section>
      <section aria-label="Paste a link" className="space-y-3">
        <SectionLabel className="flex items-center gap-2">
          <Link aria-hidden className="size-4" /> Paste a link
        </SectionLabel>
        <Muted>A Jira issue or key, a Confluence or Notion page, or any public web page.</Muted>
        <PasteLinkForm acting={acting} notes={notes} onNotesChange={setNotes} onImport={add} />
      </section>
      <section aria-label="Imported" className="space-y-3">
        <SectionLabel className="flex items-center gap-2">
          <Download aria-hidden className="size-4" /> Imported
        </SectionLabel>
        <ImportedItems
          items={list.data?.items ?? []}
          acting={acting}
          onRefresh={(id) =>
            void act(async () => settle(await run('imports.refresh', { project, id, notes })))
          }
          onOpen={(item) => void run('vault.openNote', { note: item.note ?? item.snapshot })}
          onStartSession={props.onStartSession}
        />
      </section>
      {browsing && (
        <SourcePickerDialog
          source={browsing.id}
          label={browsing.label}
          project={project}
          notes={notes}
          onNotesChange={setNotes}
          onImport={add}
          onStartSession={props.onStartSession}
          onClose={() => setBrowsing(undefined)}
        />
      )}
    </div>
  );
}
