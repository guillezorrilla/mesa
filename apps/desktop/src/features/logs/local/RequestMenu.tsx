import { SendHorizontal, Waypoints } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * A line's request ids' menu, opened from `children` (a row's action, the request chip): for each
 * id, Show this request across the project's sources, or Send it to the agent. Clicks stay in the
 * menu, so the row under it is not selected.
 */
export function RequestMenu(props: {
  ids: readonly string[];
  onShow: (id: string) => void;
  onSend: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{props.children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {props.ids.map((id, at) => (
          <Fragment key={id}>
            {at > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="font-mono text-xs text-muted-foreground">
              request {id}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => props.onShow(id)}>
              <Waypoints aria-hidden /> Show this request
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onSend(id)}>
              <SendHorizontal aria-hidden /> Send this request
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
