import type { TerminalSquare } from 'lucide-react';
import { CountPill } from '@/components/CountPill';
import { Button } from '@/components/ui/button';
import type { WorkspaceView } from '../navigation';

/**
 * An icon button that opens `target`, marked current while a view of its kind shows, with `count`
 * in a corner pill while it is above 0.
 */
export function SidebarNavButton(props: {
  label: string;
  icon: typeof TerminalSquare;
  target: WorkspaceView;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  count?: number;
}) {
  const { label, target } = props;
  const Icon = props.icon;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      data-testid={`nav-${label.toLowerCase()}`}
      aria-label={props.count ? `${label}, ${props.count} waiting` : label}
      aria-current={props.view.kind === target.kind ? 'page' : undefined}
      title={label}
      className="relative"
      onClick={() => props.onView(target)}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {!!props.count && (
        <CountPill
          count={props.count}
          className="absolute -top-1 -right-1 px-1 text-[10px] leading-4"
        />
      )}
    </Button>
  );
}
