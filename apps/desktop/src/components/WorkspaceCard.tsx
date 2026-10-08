import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from './IconButton';
import { Muted } from './Muted';

/**
 * One card above the workspace's sessions: an icon, a title, one line on why it matters, its one
 * action, and a close button. Each card decides when it shows and what closing it keeps.
 */
export function WorkspaceCard(props: {
  testId: string;
  /** What the card is to a screen reader: a tip, a notice. */
  label: string;
  icon: LucideIcon;
  title: string;
  line: ReactNode;
  action?: ReactNode;
  closeLabel: string;
  onClose: () => void;
}) {
  const Icon = props.icon;
  return (
    <aside
      data-testid={props.testId}
      aria-label={props.label}
      className="mx-auto flex w-full max-w-3xl items-center gap-3 rounded-xl border bg-card/60 py-2.5 pr-2 pl-3 shadow-xs"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-state-waiting/15 text-state-waiting">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{props.title}</p>
        <Muted size="xs">{props.line}</Muted>
      </div>
      {props.action}
      <IconButton label={props.closeLabel} icon={X} onClick={props.onClose} />
    </aside>
  );
}
