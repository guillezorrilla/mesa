import { NEW_SESSION, type NotesRecipient } from '@mesa/core/browser';
import { Bot, Send } from 'lucide-react';
import { SplitButton } from '@/components/SplitButton';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

/**
 * Send notes (N), the unsent notes as one prompt to this session; its menu sends them to this
 * session, another in its checkout, its parent or a child (`recipients`, this one first), or a new
 * agent there, or sends only the open file's. One waiting on a person is listed, disabled.
 */
export function SendNotesMenu(props: {
  count: number;
  /** The open file's unsent notes. */
  fileCount: number;
  busy: boolean;
  recipients: NotesRecipient[];
  /** `to`: none for this session; `onlyFile`: the open file's notes only. */
  onSend: (send: { to?: string; onlyFile?: boolean }) => void;
}) {
  return (
    <SplitButton
      size="xs"
      variant="outline"
      // This session waiting on a person: a send would type into its prompt.
      disabled={props.busy || !props.count || Boolean(props.recipients[0]?.waiting)}
      onClick={() => props.onSend({})}
      menuLabel="More ways to send notes"
      menu={
        <>
          <DropdownMenuLabel>Send notes to</DropdownMenuLabel>
          {props.recipients.map((r, index) => (
            <DropdownMenuItem
              key={r.id}
              disabled={Boolean(r.waiting)}
              onSelect={() => props.onSend(index ? { to: r.id } : {})}
            >
              <span className="grid">
                <span>{index ? r.name : `This session (${r.name})`}</span>
                {r.waiting && <span className="text-xs text-muted-foreground">{r.waiting}</span>}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => props.onSend({ to: NEW_SESSION })}>
            <Bot aria-hidden /> New agent here
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!props.fileCount}
            onSelect={() => props.onSend({ onlyFile: true })}
          >
            Send this file's notes ({props.fileCount})
          </DropdownMenuItem>
        </>
      }
    >
      <Send aria-hidden /> Send notes ({props.count})
    </SplitButton>
  );
}
