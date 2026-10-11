import { RELEASE_GROUPS, type ReleaseNotes } from '@mesa/core/browser';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ReleaseGroup = (typeof RELEASE_GROUPS)[number]['key'];

/**
 * Each group's Session state colour (so the colour-vision modes recolour it too): the dot in the
 * summary, the badge, and the rail its notes hang off. Full class names, for Tailwind.
 */
const TONE = {
  added: {
    dot: 'bg-state-idle',
    badge: 'border-state-idle/30 bg-state-idle/10 text-state-idle',
    rail: 'border-state-idle/35 [&>li]:before:bg-state-idle',
  },
  changed: {
    dot: 'bg-state-working',
    badge: 'border-state-working/30 bg-state-working/10 text-state-working',
    rail: 'border-state-working/35 [&>li]:before:bg-state-working',
  },
  fixed: {
    dot: 'bg-state-waiting',
    badge: 'border-state-waiting/30 bg-state-waiting/10 text-state-waiting',
    rail: 'border-state-waiting/35 [&>li]:before:bg-state-waiting',
  },
} as const;

/**
 * A What's new notice: its title, "2 new · 1 changed · 6 fixed" (zero counts left out), and a
 * toggle that expands its notes in place under NEW, CHANGED and FIXED badges, each group a
 * coloured rail with a stop per note. The first expand calls `onExpand`. Notes are plain text:
 * React escapes them, so a note never renders as HTML.
 */
export function ReleaseNotesPanel(props: {
  title: string;
  /** None when the changelog Mesa ships has no section for the version. */
  notes: ReleaseNotes | undefined;
  onExpand: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const notesIn = (key: ReleaseGroup) => props.notes?.[key] ?? [];
  const groups = RELEASE_GROUPS.filter(({ key }) => notesIn(key).length);
  const toggle = () => {
    if (!expanded) props.onExpand();
    setExpanded(!expanded);
  };
  return (
    <>
      <div className="flex items-start gap-1">
        <button
          type="button"
          aria-expanded={expanded}
          className="flex-1 text-left text-sm font-semibold hover:underline"
          onClick={toggle}
        >
          {props.title}
        </button>
        <IconButton
          label={expanded ? 'Hide notes' : 'Show notes'}
          icon={ChevronDown}
          size="icon-xs"
          aria-expanded={expanded}
          className="-mt-0.5 [&_svg]:transition-transform aria-expanded:[&_svg]:rotate-180 motion-reduce:[&_svg]:transition-none"
          onClick={toggle}
        />
      </div>
      <Muted size="xs" data-testid="release-summary" className="tabular-nums">
        {groups.length
          ? groups.map(({ key, label }, i) => (
              <span key={key}>
                {i > 0 && ' · '}
                <span
                  aria-hidden
                  className={cn(
                    'mr-1 inline-block size-1.5 rounded-full align-middle',
                    TONE[key].dot,
                  )}
                />
                {notesIn(key).length} {label.toLowerCase()}
              </span>
            ))
          : 'No notes for this version'}
      </Muted>
      {expanded && (
        <div
          data-testid="release-notes"
          className="mt-2 max-h-80 space-y-3 overflow-y-auto overscroll-contain rounded-md border bg-background/60 p-3 animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none"
        >
          {groups.map(({ key, label }) => (
            <section key={key} aria-label={label}>
              <Badge
                variant="outline"
                className={cn(
                  'px-1.5 font-mono text-[10px] tracking-widest uppercase',
                  TONE[key].badge,
                )}
              >
                {label}
              </Badge>
              <ul
                className={cn(
                  'mt-2 ml-[5px] space-y-1.5 border-l-2 pl-3',
                  '[&>li]:relative [&>li]:before:absolute [&>li]:before:top-[7px] [&>li]:before:-left-4 [&>li]:before:size-1.5 [&>li]:before:rounded-full [&>li]:before:ring-2 [&>li]:before:ring-background',
                  TONE[key].rail,
                )}
              >
                {notesIn(key).map((note) => (
                  <li key={note} className="text-xs leading-relaxed text-foreground/90">
                    {note}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
