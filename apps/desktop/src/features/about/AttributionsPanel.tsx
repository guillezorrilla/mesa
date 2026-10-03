import type { Attribution } from '@mesa/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { Input } from '@/components/ui/input';

const key = (a: Attribution) => `${a.source}:${a.name}@${a.version}`;

/** The third-party packages Mesa ships, searchable by name or license; a row expands to its text. */
export function AttributionsPanel(props: { attributions: Attribution[]; note?: string }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string>();
  const words = query.trim().toLowerCase();
  const shown = props.attributions.filter((a) =>
    `${a.name} ${a.license}`.toLowerCase().includes(words),
  );
  return (
    <section aria-label="Third-party licenses" className="space-y-2">
      <SectionLabel>Third-party licenses ({props.attributions.length})</SectionLabel>
      {props.note && <Muted>{props.note}</Muted>}
      {props.attributions.length > 0 && (
        <Input
          type="search"
          aria-label="Search licenses"
          placeholder="Search by package or license"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <ul className="divide-y rounded-md border">
        {shown.map((a) => {
          const expanded = open === key(a);
          const Chevron = expanded ? ChevronDown : ChevronRight;
          return (
            <li key={key(a)} data-testid="attribution">
              <button
                type="button"
                aria-expanded={expanded}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => setOpen(expanded ? undefined : key(a))}
              >
                <Chevron aria-hidden className="size-3 shrink-0 text-muted-foreground" />
                <span className="font-medium">{a.name}</span>
                <span className="text-muted-foreground text-xs">{a.version}</span>
                <span className="ml-auto text-muted-foreground text-xs">{a.license}</span>
              </button>
              {expanded && (
                <pre
                  data-testid="license-text"
                  className="max-h-80 overflow-auto whitespace-pre-wrap bg-muted/40 px-3 py-2 font-mono text-xs"
                >
                  {a.text}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
      {props.attributions.length > 0 && shown.length === 0 && <Muted>No package matches.</Muted>}
    </section>
  );
}
