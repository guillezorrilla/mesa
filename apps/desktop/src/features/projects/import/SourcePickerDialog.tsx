import type { SourceId } from '@mesa/core';
import { NOTES_MAX_ITEMS } from '@mesa/core/browser';
import { FolderTree, Search } from 'lucide-react';
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
 * it; tick pages and issues, and Import runs the project's import (`onImport`) of their URLs,
 * with Write notes as the panel has it. It closes once the import ran.
 */
export function SourcePickerDialog(props: {
  source: SourceId;
  label: string;
  project: string;
  notes: boolean;
  onNotesChange: (notes: boolean) => void;
  onImport: (links: string[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const picker = usePicked(props.source);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const count = picker.picked.size;
  // Core refuses this too; said here, before Import, so a big tick is not lost to it.
  const tooMany = props.notes && count > NOTES_MAX_ITEMS;
  const submit = async () => {
    setImporting(true);
    const done = await props.onImport([...picker.picked.values()].map((item) => item.url));
    setImporting(false);
    if (done) props.onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !importing && props.onClose()}>
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
            {picker.including ? 'Ticking the pages under it...' : `${count} ticked`}
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
            <Button variant="outline" disabled={importing} onClick={props.onClose}>
              Cancel
            </Button>
            <Button
              data-testid="import-picked"
              disabled={importing || picker.including || !count || tooMany}
              onClick={() => void submit()}
            >
              {importing ? 'Importing...' : 'Import'}
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
