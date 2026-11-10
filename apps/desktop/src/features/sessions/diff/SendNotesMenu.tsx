import { Send } from 'lucide-react';
import { SplitButton } from '@/components/SplitButton';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

/** Send notes (N), the unsent notes as one prompt; its menu sends only the open file's. */
export function SendNotesMenu(props: {
  count: number;
  /** The open file's unsent notes. */
  fileCount: number;
  busy: boolean;
  onSend: (onlyFile: boolean) => void;
}) {
  return (
    <SplitButton
      size="xs"
      variant="outline"
      disabled={props.busy || !props.count}
      onClick={() => props.onSend(false)}
      menuLabel="More ways to send notes"
      menu={
        <DropdownMenuItem disabled={!props.fileCount} onSelect={() => props.onSend(true)}>
          Send this file's notes ({props.fileCount})
        </DropdownMenuItem>
      }
    >
      <Send aria-hidden /> Send notes ({props.count})
    </SplitButton>
  );
}
