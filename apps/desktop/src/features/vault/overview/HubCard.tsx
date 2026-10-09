import type { ProjectContext } from '@mesa/core';
import { ChevronDown, ExternalLink, FileText } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { MarkdownView } from '@/components/MarkdownView';
import { Button } from '@/components/ui/button';
import { useOptional, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { NoteMarkdown, PROSE } from '../NoteMarkdown';

/** The hub's height while folded, in pixels: Tailwind's max-h-96. */
const FOLDED = 384;

/**
 * The project's hub note, read in full with its links, which open in the Vault screen; until it
 * is read (or if it cannot be), its excerpt. A long hub folds to FOLDED, with Show more.
 */
export function HubCard(props: {
  hub: NonNullable<ProjectContext['hub']>;
  onItem: (path: string) => void;
}) {
  const { hub } = props;
  const run = useRun();
  const read = useOptional('vault.read', { path: hub.path }).data;
  const body = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => setLong(el.scrollHeight > FOLDED + 48);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const folded = long && !open;
  return (
    <section
      aria-label="Project hub"
      data-testid="vault-overview-hub"
      className="min-w-0 rounded-xl border bg-card"
    >
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {hub.path}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={() => void run('vault.openNote', { note: hub.path })}
        >
          <ExternalLink aria-hidden /> Open in Obsidian
        </Button>
      </div>
      <div className="relative">
        <div
          ref={body}
          className={cn('px-5 py-4', folded && 'overflow-hidden')}
          style={folded ? { maxHeight: FOLDED } : undefined}
        >
          {read?.preview === 'markdown' ? (
            <NoteMarkdown body={read.body} links={read.links} onSelect={props.onItem} />
          ) : (
            <div className={PROSE}>
              <MarkdownView text={hub.excerpt} />
            </div>
          )}
        </div>
        {folded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-b-xl bg-gradient-to-t from-card to-transparent" />
        )}
      </div>
      {long && (
        <div className="border-t px-2 py-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full text-xs text-muted-foreground"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <ChevronDown aria-hidden className={cn('transition-transform', open && 'rotate-180')} />
            {open ? 'Show less' : 'Show more'}
          </Button>
        </div>
      )}
    </section>
  );
}
