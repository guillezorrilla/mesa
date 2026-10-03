import { BookOpen, CircleHelp, Info, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FIXED_SHORTCUTS, keyCaps } from '@/lib/fixedShortcuts';

/** The header's help menu: keyboard shortcuts, Mesa's command reference, and About Mesa. */
export function HelpMenu(props: {
  onShortcuts: () => void;
  onReference: () => void;
  onAbout: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          data-testid="nav-help"
          aria-label="Help"
          title="Help"
          className="text-muted-foreground hover:text-foreground"
        >
          <CircleHelp aria-hidden className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onSelect={props.onShortcuts}>
          <Keyboard aria-hidden className="size-4" /> Keyboard shortcuts
          <span className="ml-auto text-xs text-muted-foreground">
            ({keyCaps(FIXED_SHORTCUTS.keyboardShortcuts).join('')})
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={props.onReference}>
          <BookOpen aria-hidden className="size-4" /> Command reference
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={props.onAbout}>
          <Info aria-hidden className="size-4" /> About Mesa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
