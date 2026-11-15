import type { ChatMessage } from '@mesa/core';
import { ArrowDown } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { MarkdownView } from '@/components/MarkdownView';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { PROSE } from '@/features/vault/NoteMarkdown';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { cn } from '@/lib/utils';
import type { SentPrompt } from '../selected/useSessionPrompt';
import { ChatComposer } from './ChatComposer';
import { useChat } from './useChat';

/** How near an end of the list counts as at it, in pixels. */
const NEAR = 40;

/**
 * The selected session as a chat over its terminal: the person's prompts and its agent's replies
 * from its transcript, oldest at the top, and a composer that types into the same terminal. It
 * opens at the bottom and follows new replies while there; scrolled up, it holds still and offers
 * New; at the top it reads further back.
 */
export function ChatPanel(props: {
  sessionId: string;
  acting: boolean;
  sent?: SentPrompt;
  onSend: (prompt: string, form: HTMLFormElement) => void;
}) {
  const { chat, error, sending, loadingOlder, older } = useChat(props.sessionId, props.sent);
  const platform = usePlatform();
  const { act } = useAct();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  /** How far from the bottom the view was when it asked for older messages, to stay there. */
  const fromBottom = useRef<number>(undefined);
  const [fresh, setFresh] = useState(false);
  const messages = chat?.messages ?? [];
  const newest = `${messages.length}:${messages.at(-1)?.id}:${sending?.at}`;
  const seen = useRef(newest);
  useLayoutEffect(() => {
    const view = scroller.current;
    if (!view) return;
    if (fromBottom.current !== undefined) {
      if (loadingOlder) return;
      view.scrollTop = view.scrollHeight - fromBottom.current;
      fromBottom.current = undefined;
    } else if (atBottom.current) view.scrollTop = view.scrollHeight;
    else if (newest !== seen.current) setFresh(true);
    seen.current = newest;
  }, [newest, loadingOlder]);
  const toBottom = () => {
    const view = scroller.current;
    if (view) view.scrollTop = view.scrollHeight;
    atBottom.current = true;
    setFresh(false);
  };
  const readOlder = () => {
    const view = scroller.current;
    if (!view || !chat?.more || fromBottom.current !== undefined) return;
    fromBottom.current = view.scrollHeight - view.scrollTop;
    older();
  };
  const copy = (code: string) =>
    void act(async () => {
      await platform.clipboard.write(code);
      return said('Code copied');
    });
  return (
    <section
      aria-label={`Session ${props.sessionId} chat`}
      className="relative flex h-full min-w-0 flex-1 flex-col"
    >
      <div
        ref={scroller}
        data-testid="chat-messages"
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const view = event.currentTarget;
          atBottom.current = view.scrollHeight - view.scrollTop - view.clientHeight < NEAR;
          if (atBottom.current) setFresh(false);
          if (view.scrollTop < NEAR) readOlder();
        }}
      >
        <ol className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
          {chat?.more && (
            <li className="self-center">
              <Button variant="ghost" size="sm" disabled={loadingOlder} onClick={readOlder}>
                {loadingOlder ? 'Reading older messages' : 'Older messages'}
              </Button>
            </li>
          )}
          {messages.map((message, index) => (
            // Two prompts with the same words share an id: the place tells them apart.
            // biome-ignore lint/suspicious/noArrayIndexKey: messages are stateless and only prepend.
            <ChatRow key={`${index}:${message.id}`} message={message} onCopyCode={copy} />
          ))}
          {sending && (
            <li className="flex flex-col items-end gap-1 opacity-60">
              <div className={YOU}>{sending.prompt}</div>
              <Muted size="xs">Sending</Muted>
            </li>
          )}
        </ol>
        {chat && !messages.length && !sending && (
          <Muted className="p-6 text-center">{chat.unavailable ?? 'No messages yet.'}</Muted>
        )}
        {error && !chat && <Muted className="p-6 text-center">{error.message}</Muted>}
      </div>
      {fresh && (
        <Button
          size="sm"
          variant="secondary"
          className="-translate-x-1/2 absolute bottom-24 left-1/2 shadow-sm"
          onClick={toBottom}
        >
          <ArrowDown aria-hidden /> New
        </Button>
      )}
      <ChatComposer sessionId={props.sessionId} acting={props.acting} onSend={props.onSend} />
    </section>
  );
}

const YOU = 'max-w-[80%] whitespace-pre-wrap break-words rounded-lg bg-accent px-3 py-2 text-sm';

/** One message: the person's as a plain bubble on the right, the agent's as Markdown. */
function ChatRow(props: { message: ChatMessage; onCopyCode: (code: string) => void }) {
  const { message } = props;
  return (
    <li className={cn('flex', message.from === 'you' && 'justify-end')}>
      {message.from === 'you' ? (
        <div className={YOU}>{message.text}</div>
      ) : (
        <div className={cn(PROSE, 'w-full')}>
          <MarkdownView text={message.text} onCopyCode={props.onCopyCode} />
        </div>
      )}
    </li>
  );
}
