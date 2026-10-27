import { Columns2, List, ListTree, PanelLeft, Rows2 } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import type { DiffView } from './useDiffView';

/** A diff view's toggles: the file list, as a folder tree or flat, and inline or side by side. */
export function DiffViewToggles({ view }: { view: DiffView }) {
  const inline = view.layout === 'inline';
  return (
    <>
      <IconButton
        label={view.list ? 'Hide file list' : 'Show file list'}
        icon={PanelLeft}
        active={view.list}
        onClick={view.toggleList}
      />
      {view.list && (
        <IconButton
          label={view.tree ? 'Flat file list' : 'Folder tree'}
          icon={view.tree ? List : ListTree}
          onClick={view.toggleTree}
        />
      )}
      <IconButton
        label={inline ? 'Side-by-side diff' : 'Inline diff'}
        icon={inline ? Columns2 : Rows2}
        onClick={() => view.setLayout(inline ? 'side-by-side' : 'inline')}
      />
    </>
  );
}
