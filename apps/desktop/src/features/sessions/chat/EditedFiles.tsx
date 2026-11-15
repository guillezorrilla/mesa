import type { ChatFileEdit } from '@mesa/core';
import { Code } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Stat } from '@/components/Stat';
import { Button } from '@/components/ui/button';

/** How many files the card lists; the rest are in the diff. */
const SHOWN = 3;
const STAT = 'ml-auto font-sans text-[13px]';

/** A path's file name and the two folders above it, the way the card shows it. */
const fileParts = (path: string) => {
  const parts = path.split('/').filter(Boolean);
  return { name: parts.at(-1) ?? path, folder: parts.slice(-3, -1).join('/') };
};

/**
 * The files a turn changed, as a card closing it: the first few with their folder and lines added
 * and removed, then the whole turn's lines; with `onSeeAll`, See all opens the session's diff.
 */
export function EditedFiles(props: { files: ChatFileEdit[]; onSeeAll?: () => void }) {
  const { files, onSeeAll } = props;
  const title = `Edited ${files.length} ${files.length === 1 ? 'file' : 'files'}`;
  const sum = (key: 'added' | 'removed') => files.reduce((total, file) => total + file[key], 0);
  const more = files.length - SHOWN;
  return (
    <section aria-label={title} className="grid gap-1 rounded-xl bg-muted/60 px-4 py-3 text-sm">
      <h3 className="pb-1 font-medium">{title}</h3>
      <ul className="grid gap-1">
        {files.slice(0, SHOWN).map((file) => {
          const { name, folder } = fileParts(file.path);
          return (
            <li key={file.path} title={file.path} className="flex min-w-0 items-center gap-2">
              <Code aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{name}</span>
              {folder && <span className="truncate text-muted-foreground">{folder}</span>}
              <Stat added={file.added} removed={file.removed} className={STAT} />
            </li>
          );
        })}
      </ul>
      <div className="flex min-h-7 items-center gap-2">
        {onSeeAll ? (
          <Button variant="link" size="sm" className="h-7 px-0 text-foreground" onClick={onSeeAll}>
            See all
          </Button>
        ) : (
          more > 0 && <Muted size="xs">{more} more</Muted>
        )}
        <Stat added={sum('added')} removed={sum('removed')} className={STAT} />
      </div>
    </section>
  );
}
