import { FileX } from 'lucide-react';

/** No file open: the prompt and the two shortcuts, each also a button. */
export function FilesEmptyState(props: { onGoTo: () => void; onSearch: () => void }) {
  const chip = 'rounded-md bg-muted px-3 py-1.5 hover:text-foreground';
  return (
    <div className="grid flex-1 place-items-center">
      <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
        <FileX aria-hidden className="size-10 opacity-60" strokeWidth={1.5} />
        <p>Pick a file from the tree to edit it.</p>
        <div className="flex gap-2 text-xs">
          <button type="button" className={chip} onClick={props.onGoTo}>
            Cmd+P to go to file
          </button>
          <button type="button" className={chip} onClick={props.onSearch}>
            Cmd+Shift+F to search
          </button>
        </div>
      </div>
    </div>
  );
}
