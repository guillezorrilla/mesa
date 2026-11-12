import { NEW_SESSION, type NotesRecipient } from '@mesa/core/browser';
import { Bot, Send } from 'lucide-react';
import { CountPill } from '@/components/CountPill';
import { SplitButton } from '@/components/SplitButton';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

/**
 * Send notes, with the count of notes it sends beside it (none: hidden, and it is disabled): the
 * unsent notes and those still open from the last round, as one prompt to this session, or to a
 * new agent when it is a plain terminal; its menu sends them to this session, another in its
 * checkout, its parent or a child (`recipients`, this one first), or a new agent there, or sends
 * only the open file's. One that cannot take them now is listed, disabled, with why.
 */
export function SendNotesMenu(props: {
  /** The notes the next send holds. */
  count: number;
  /** The open file's notes the next send holds. */
  fileCount: number;
  busy: boolean;
  recipients: NotesRecipient[];
  /** `to`: none for this session; `onlyFile`: the open file's notes only. */
  onSend: (send: { to?: string; onlyFile?: boolean }) => void;
}) {
  const [self] = props.recipients;
  // A plain terminal has no agent to read them: they go to a new one.
  const fallback = self?.terminal ? { to: NEW_SESSION } : {};
  return (
    <div className="flex items-center gap-1.5">
      {props.count > 0 && (
        <span data-testid="notes-to-send" title="Notes the next send holds">
          <CountPill count={props.count} />
          <span className="sr-only"> notes to send</span>
        </span>
      )}
      <SplitButton
        size="xs"
        variant="outline"
        // None yet (the board is still read), or this session waiting on a person: a send would
        // go to the wrong place or type into its prompt.
        disabled={
          props.busy || !props.count || !self || Boolean(self.unavailable && !self.terminal)
        }
        onClick={() => props.onSend(fallback)}
        menuLabel="More ways to send notes"
        menu={
          <>
            <DropdownMenuLabel>Send notes to</DropdownMenuLabel>
            {props.recipients.map((r, index) => (
              <DropdownMenuItem
                key={r.id}
                disabled={Boolean(r.unavailable)}
                onSelect={() => props.onSend(index ? { to: r.id } : {})}
              >
                <span className="grid">
                  <span>{index ? r.name : `This session (${r.name})`}</span>
                  {r.unavailable && (
                    <span className="text-xs text-muted-foreground">{r.unavailable}</span>
                  )}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={() => props.onSend({ to: NEW_SESSION })}>
              <Bot aria-hidden /> New agent here
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!props.fileCount}
              onSelect={() => props.onSend({ ...fallback, onlyFile: true })}
            >
              Send this file's notes ({props.fileCount})
            </DropdownMenuItem>
          </>
        }
      >
        <Send aria-hidden /> {self?.terminal ? 'Send notes to a new agent' : 'Send notes'}
      </SplitButton>
    </div>
  );
}
