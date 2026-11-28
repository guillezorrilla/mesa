import type { CopyFormat, LogAsk } from '@mesa/core';
import { Lightbulb, MessageCircleQuestion, Play, SendHorizontal, Wrench } from 'lucide-react';
import { useState } from 'react';
import { SplitButton } from '@/components/SplitButton';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { CopyButton } from '../shared/CopyButton';

/**
 * The Logs panel's footer: how many lines are picked, Clear, and what to do with them: Send to
 * agent with Explain, Find the cause and fix, and Ask..., or, for a session that takes no prompt,
 * the same as a new session's goal.
 */
export function LogsFooter(props: {
  picked: number;
  /** The session shows a prompt field; else the lines start a new session. */
  takesPrompt: boolean;
  onAsk: (ask: LogAsk) => void;
  onCopy: (format: CopyFormat) => void;
  onClear: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState('');
  const ask = () => {
    if (!question.trim()) return;
    props.onAsk({ kind: 'ask', question });
    setQuestion('');
    setAsking(false);
  };
  if (asking)
    return (
      <footer className="flex min-h-11 shrink-0 items-center gap-2 border-t px-3 py-2">
        <Input
          autoFocus
          aria-label="Ask about these lines"
          placeholder="Ask about these lines"
          className="h-8 flex-1 text-xs"
          value={question}
          onChange={(event) => setQuestion(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') ask();
            if (event.key === 'Escape') setAsking(false);
          }}
        />
        <Button size="sm" disabled={!question.trim()} onClick={ask}>
          Ask
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </footer>
    );
  const none = !props.picked;
  return (
    <footer className="flex min-h-11 shrink-0 items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
      <span className="mr-auto" role="status">
        {none
          ? 'Click lines to select them'
          : `${props.picked} ${props.picked === 1 ? 'line' : 'lines'} selected`}
      </span>
      <Button size="sm" variant="ghost" disabled={none} onClick={props.onClear}>
        Clear
      </Button>
      <CopyButton size="sm" label="Copy" onCopy={props.onCopy} />
      <SplitButton
        disabled={none}
        menuLabel="More ways to ask"
        onClick={() => props.onAsk({ kind: 'send' })}
        menu={
          <>
            <DropdownMenuItem onSelect={() => props.onAsk({ kind: 'explain' })}>
              <Lightbulb aria-hidden /> Explain
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onAsk({ kind: 'fix' })}>
              <Wrench aria-hidden /> Find the cause and fix
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAsking(true)}>
              <MessageCircleQuestion aria-hidden /> Ask...
            </DropdownMenuItem>
          </>
        }
      >
        {props.takesPrompt ? (
          <>
            <SendHorizontal aria-hidden /> Send to agent
          </>
        ) : (
          <>
            <Play aria-hidden /> Start a session with these lines
          </>
        )}
      </SplitButton>
    </footer>
  );
}
