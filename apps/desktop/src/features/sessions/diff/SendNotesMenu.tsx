import { ChevronDown, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Send notes (N), the unsent notes as one prompt; its menu sends only the open file's. */
export function SendNotesMenu(props: {
  count: number;
  /** The open file's unsent notes. */
  fileCount: number;
  busy: boolean;
  onSend: (onlyFile: boolean) => void;
}) {
  return (
    <div className="flex">
      <Button
        size="xs"
        variant="outline"
        className="rounded-r-none"
        disabled={props.busy || !props.count}
        onClick={() => props.onSend(false)}
      >
        <Send aria-hidden /> Send notes ({props.count})
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="xs"
            variant="outline"
            aria-label="More ways to send notes"
            className="rounded-l-none border-l-0 px-1"
            disabled={props.busy || !props.count}
          >
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!props.fileCount} onSelect={() => props.onSend(true)}>
            Send this file's notes ({props.fileCount})
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
