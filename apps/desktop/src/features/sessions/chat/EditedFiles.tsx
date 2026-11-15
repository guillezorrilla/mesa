import type { ChatFileEdit } from '@mesa/core';
import { Code } from 'lucide-react';
import { Stat } from '@/components/Stat';
import { Button } from '@/components/ui/button';

/** How many files the card lists before See all. */
const SHOWN = 3;

/** A path's file name and the two folders above it, the way the card shows it. */
const place = (path: string) => {
  const parts = path.split('/').filter(Boolean);
  return { name: parts.at(-1) ?? path, folder: parts.slice(-3, -1).join('/') };
};

/**
 * The files a turn changed, as a card closing it: each with its folder and lines added and
 * removed. With `onSeeAll` it lists the first few and See all opens the session's diff;
 * without, it lists them all.
 */
export function EditedFiles(props: { files: ChatFileEdit[]; onSeeAll?: () => void }) {
  const { files, onSeeAll } = props;
  const shown = onSeeAll ? files.slice(0, SHOWN) : files;
  const sum = (key: 'added' | 'removed') => files.reduce((total, file) => total + file[key], 0);
  return (
    <section
      aria-label={`Edited ${files.length} ${files.length === 1 ? 'file' : 'files'}`}
      className="grid gap-1 rounded-xl bg-muted/60 px-4 py-3 text-sm"
    >
      <h3 className="pb-1 font-medium">
        Edited {files.length} {files.length === 1 ? 'file' : 'files'}
      </h3>
      <ul className="grid gap-1">
        {shown.map((file) => {
          const { name, folder } = place(file.path);
          return (
            <li key={file.path} title={file.path} className="flex min-w-0 items-center gap-2">
              <Code aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{name}</span>
              {folder && <span className="truncate text-muted-foreground">{folder}</span>}
              <Stat
                added={file.added}
                removed={file.removed}
                className="ml-auto font-sans text-[13px]"
              />
            </li>
          );
        })}
      </ul>
      {onSeeAll && (
        <div className="flex items-center">
          <Button variant="link" size="sm" className="h-7 px-0 text-foreground" onClick={onSeeAll}>
            See all
          </Button>
          <Stat
            added={sum('added')}
            removed={sum('removed')}
            className="ml-auto font-sans text-[13px]"
          />
        </div>
      )}
    </section>
  );
}
