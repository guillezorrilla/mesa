import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** One card of the project overview: an icon, a title with its count, and its content. */
export function OverviewCard(props: {
  title: string;
  icon: LucideIcon;
  count?: number;
  testId?: string;
  children: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <section
      aria-label={props.title}
      data-testid={props.testId}
      className="min-w-0 rounded-xl border bg-card"
    >
      <h4 className="flex items-center gap-2 border-b px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        <span className="flex-1">{props.title}</span>
        {props.count !== undefined && <span className="tabular-nums">{props.count}</span>}
      </h4>
      <div className="p-2">{props.children}</div>
    </section>
  );
}
