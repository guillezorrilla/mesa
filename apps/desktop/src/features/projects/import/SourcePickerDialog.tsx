import type { SourceId } from '@mesa/core';
import { NOTES_MAX_ITEMS } from '@mesa/core/browser';
import { FolderTree, Play, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { IncludeDescendantsDialog } from './IncludeDescendantsDialog';
import { SourceTreeChildren } from './SourceTreeChildren';
import { usePicked } from './usePicked';

/**
 * The Picker (CONTEXT.md): a source's tree, opened a node at a time, or what a search finds in
 * it; tick pages and issues, and Import starts the project's import (`onImport`) of their URLs,
 * with Write notes as the panel has it, and closes: the import runs in the background, its
 * progress in the Context tab. With one ticked, Start session imports it the same way, then
 * hands its link to `onStartSession`. While an import into the project runs, another waits.
 */
export function SourcePickerDialog(props: {
  source: SourceId;
  label: string;
  project: string;
  notes: boolean;
  /** An import into the project is running. */
  importing: boolean;
  onNotesChange: (notes: boolean) => void;
  /** Starts the import; `then` runs once it imported. */
  onImport: (links: string[], then?: () => void) => void;
  onStartSession: (from: string) => void;
  onClose: () => void;
}) {
  const picker = usePicked(props.source);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const count = picker.picked.size;
  // Core refuses this too; said here, before Import, so a big tick is not lost to it.
  const tooMany = props.notes && count > NOTES_MAX_ITEMS;
  const links = [...picker.picked.values()].map((item) => item.url);
  const [only] = links;
  /** Starts importing the ticked items, and closes; `then` once they are in. */
  const submit = (then?: () => void) => {
    props.onImport(links, then);
    props.onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        data-testid="source-picker-dialog"
        className="flex max-h-[calc(100vh-2rem)] flex-col sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree aria-hidden className="size-5 text-ring" />
            Browse {props.label}
          </DialogTitle>
          <DialogDescription>
            Tick the pages and issues to import into {props.project}.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(query.trim());
          }}
        >
          <Input
            aria-label={`Search ${props.label}`}
            placeholder="Search page titles and issue text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!event.target.value.trim()) setSearch('');
            }}
          />
          <Button type="submit" variant="secondary" size="icon" aria-label="Search">
            <Search aria-hidden />
          </Button>
        </form>
        <div
          data-testid="source-tree"
          className="min-h-48 flex-1 overflow-y-auto rounded-md border p-1"
        >
          <SourceTreeChildren
            key={search}
            source={props.source}
            {...(search ? { search } : {})}
            depth={0}
            picker={picker}
          />
        </div>
        {tooMany && (
          <p data-testid="too-many" className="text-destructive text-sm">
            Write notes takes at most {NOTES_MAX_ITEMS} items in one import: untick some, or turn
            Write notes off.
          </p>
        )}
        <DialogFooter className="items-center gap-3 sm:justify-between">
          <span data-testid="picked-count" className="text-muted-foreground text-sm">
            {picker.including
              ? 'Ticking the pages under it...'
              : props.importing
                ? `${count} ticked; an import is running`
                : `${count} ticked`}
          </span>
          <div className="flex items-center gap-3">
            <Label className="flex items-center gap-2 font-normal text-sm">
              <Switch
                checked={props.notes}
                onCheckedChange={props.onNotesChange}
                aria-label="Write notes"
              />
              Write notes
            </Label>
            <Button variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button
              data-testid="start-picked"
              variant="secondary"
              disabled={props.importing || picker.including || count !== 1 || tooMany || !only}
              onClick={() => only && submit(() => props.onStartSession(only))}
            >
              <Play aria-hidden /> Start session
            </Button>
            <Button
              data-testid="import-picked"
              disabled={props.importing || picker.including || !count || tooMany}
              onClick={() => submit()}
            >
              Import
            </Button>
          </div>
        </DialogFooter>
        {picker.asking && (
          <IncludeDescendantsDialog
            page={picker.asking}
            onInclude={() => picker.asking && void picker.include(picker.asking)}
            onDismiss={picker.dismiss}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
