import type { TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkspaceView } from '../navigation';

/** An icon button that opens `target`, marked current while a view of its kind shows. */
export function SidebarNavButton(props: {
  label: string;
  icon: typeof TerminalSquare;
  target: WorkspaceView;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
}) {
  const { label, target } = props;
  const Icon = props.icon;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      data-testid={`nav-${label.toLowerCase()}`}
      aria-label={label}
      aria-current={props.view.kind === target.kind ? 'page' : undefined}
      title={label}
      onClick={() => props.onView(target)}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
    </Button>
  );
}
