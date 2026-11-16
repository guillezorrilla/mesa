import type { ChatItem } from '@mesa/core';
import { memo } from 'react';
import { MarkdownView } from '@/components/MarkdownView';
import { PROSE } from '@/features/vault/NoteMarkdown';
import { cn } from '@/lib/utils';
import { MessageTime } from './MessageTime';
import { StepRun } from './StepRun';

/** The person's message: a plain bubble on the right (a prompt still sending reads the same). */
export const YOU =
  'max-w-[min(85%,48rem)] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-6';
/** The agent's replies: the vault's prose a step larger for reading at length, with tables and code chips. */
const REPLY =
  'w-full text-[15px] leading-7 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_pre_code]:text-[13px] [&_h1]:mt-6 [&_h2]:mt-6 [&_h3]:mt-5 [&_li]:mt-1 [&_table]:w-full [&_tbody_tr:last-child]:border-0 [&_td]:py-2 [&_td]:pr-6 [&_td]:align-top [&_th]:py-2 [&_th]:pr-6 [&_th]:text-left [&_th]:font-medium [&_th]:whitespace-nowrap [&_tr]:border-b';

/**
 * One row: the person's message as a plain bubble on the right, the agent's as Markdown, a run of
 * steps as its list. A message shows its time on hover.
 */
export const ChatRow = memo(function ChatRow(props: {
  message: ChatItem;
  onCopyCode: (code: string) => void;
}) {
  const { message } = props;
  if (message.from === 'steps') return <StepRun run={message} />;
  return (
    <li className={cn('group/row relative flex', message.from === 'you' && 'justify-end')}>
      <MessageTime at={message.at} side={message.from === 'you' ? 'right' : 'left'} />
      {message.from === 'you' ? (
        <div className={YOU}>{message.text}</div>
      ) : (
        <div className={cn(PROSE, REPLY)}>
          <MarkdownView text={message.text} onCopyCode={props.onCopyCode} gfm />
        </div>
      )}
    </li>
  );
});
