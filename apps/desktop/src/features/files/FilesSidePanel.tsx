import { PanelLeft, Search } from 'lucide-react';
import type { ReactNode } from 'react';

const PANES = [
  ['files', 'Files', PanelLeft],
  ['search', 'Search', Search],
] as const;

/** The Files tab's left side: the Files and Search pane tabs over the pane shown. */
export function FilesSidePanel(props: {
  pane: 'files' | 'search';
  onPane: (pane: 'files' | 'search') => void;
  children: ReactNode;
}) {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r bg-card">
      <div className="flex shrink-0 border-b" role="tablist">
        {PANES.map(([name, label, Icon]) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={props.pane === name}
            className="-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground hover:text-foreground aria-selected:border-state-working aria-selected:text-foreground"
            onClick={() => props.onPane(name)}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </button>
        ))}
      </div>
      {props.children}
    </aside>
  );
}
