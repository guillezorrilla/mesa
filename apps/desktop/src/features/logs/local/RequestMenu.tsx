import { SendHorizontal, Waypoints } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * A request id's menu, opened from `children` (a row's action, the request chip): Show this
 * request across the project's sources, or Send it to the agent. Clicks stay in the menu, so the
 * row under it is not selected.
 */
export function RequestMenu(props: {
  id: string;
  onShow: (id: string) => void;
  onSend: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{props.children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuLabel className="font-mono text-xs text-muted-foreground">
          request {props.id}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => props.onShow(props.id)}>
          <Waypoints aria-hidden /> Show this request
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onSend(props.id)}>
          <SendHorizontal aria-hidden /> Send this request
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
