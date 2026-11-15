import type { Config, SessionImage, TreeRow } from '@mesa/core';
import { ArrowDown } from 'lucide-react';
import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { MarkdownView } from '@/components/MarkdownView';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { PROSE } from '@/features/vault/NoteMarkdown';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { useCall, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { awaitsAnswer, PromptCard } from '../answer/PromptCard';
import type { SentPrompt } from '../selected/useSessionPrompt';
import { ChatComposer } from './ChatComposer';
import { CommandCard } from './CommandCard';
import { type ChatEntry, chatItems, isCommand } from './commandMarkers';
import { EditedFiles } from './EditedFiles';
import { StepRun } from './StepRun';
import { turnEdits } from './turnEdits';
import { useChat } from './useChat';
import { useCommandMarkers } from './useCommandMarkers';

/** How near an end of the list counts as at it, in pixels. */
const NEAR = 40;
/**
 * The one column every part of the chat shares, messages to composer: the pane's width with even
 * gutters, up to a width a reply still reads at.
 */
const COLUMN = 'mx-auto w-full max-w-5xl px-6';

/**
 * The selected session as a chat over its terminal: the person's prompts and its agent's replies
 * from its transcript, oldest at the top, and a composer that types into the same terminal. It
 * opens at the bottom and follows new replies while there; scrolled up, it holds still and offers
 * New; at the top it reads further back. A slash command shows as a command card, live with its
 * panel while it is the last one sent. A turn that changed files closes with their card.
 */
export function ChatPanel(props: {
  sessionId: string;
  /** The session's row, for the prompt it waits on. */
  row?: TreeRow;
  acting: boolean;
  sent?: SentPrompt;
  /** Why the last prompt was not sent: a guardrail's block, or the send's failure. */
  refused?: string;
  onSend: (prompt: string, form: HTMLFormElement, image?: SessionImage) => void;
  /** The image picked to send with the next prompt, and picking or dropping it. */
  image?: SessionImage;
  onPickImage?: () => void;
  onClearImage?: () => void;
  /** Opens the session's diff, for an Edited card's See all; none when it has no diff. */
  onOpenDiff?: () => void;
  onOpenTerminal: () => void;
  /** The profile's terminal settings, whose colours command cards draw in. */
  terminal?: Config['terminal'];
}) {
  const { chat, error, sending, loadingOlder, older } = useChat(props.sessionId, props.sent);
  const markers = useCommandMarkers(props.sessionId, props.sent);
  const run = useRun();
  const call = useCall();
  const pressKey = async (key: string) => {
    if (!(await run('sessions.keys', { id: props.sessionId, keys: [key] }))) return;
    // A look now: a picker reads as waiting-question, which refuses the next send until the board
    // sees it closed, else up to its 10 s poll later.
    void call('sessions.list');
  };
  const platform = usePlatform();
  const { act } = useAct();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  /** How far from the bottom the view was when it asked for older messages, to stay there. */
  const fromBottom = useRef<number>(undefined);
  const [fresh, setFresh] = useState(false);
  const messages = chat?.messages ?? [];
  const items = chatItems(messages, markers.list);
  const edited = turnEdits(messages);
  const newest = `${messages.length}:${messages.at(-1)?.id}:${sending?.at}:${markers.frames}`;
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
        <ol className={cn(COLUMN, 'flex flex-col gap-6 pt-6 pb-8')}>
          {chat?.more && (
            <li className="self-center">
              <Button variant="ghost" size="sm" disabled={loadingOlder} onClick={readOlder}>
                {loadingOlder ? 'Reading older messages' : 'Older messages'}
              </Button>
            </li>
          )}
          {items.map((item, index) => {
            const files = item.message && edited.get(item.message);
            return (
              // Two prompts with the same words share an id: the place tells them apart.
              // biome-ignore lint/suspicious/noArrayIndexKey: messages are stateless and only prepend.
              <Fragment key={`${index}:${item.message?.id ?? item.marker?.sentAt}`}>
                <ChatRow
                  item={item}
                  live={item.marker !== undefined && item.marker === markers.live}
                  onCopyCode={copy}
                  onKey={(key) => void pressKey(key)}
                  onOpenTerminal={props.onOpenTerminal}
                  terminal={props.terminal}
                />
                {files && (
                  <li>
                    <EditedFiles files={files} onSeeAll={props.onOpenDiff} />
                  </li>
                )}
              </Fragment>
            );
          })}
          {sending && !isCommand(sending.prompt) && (
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
      <div className={cn(COLUMN, 'relative grid gap-2 pb-4')}>
        {fresh && (
          <Button
            size="sm"
            variant="secondary"
            className="-translate-x-1/2 absolute bottom-full left-1/2 mb-3 rounded-full shadow-sm"
            onClick={toBottom}
          >
            <ArrowDown aria-hidden /> New
          </Button>
        )}
        <PromptCard row={props.row} className="mx-0 mt-0" />
        {props.refused && (
          <p role="alert" className="px-2 text-destructive text-xs">
            {props.refused}
          </p>
        )}
        <ChatComposer
          sessionId={props.sessionId}
          acting={props.acting}
          answerAbove={awaitsAnswer(props.row)}
          image={props.image}
          onPickImage={props.onPickImage}
          onClearImage={props.onClearImage}
          onSend={props.onSend}
        />
      </div>
    </section>
  );
}

const YOU =
  'max-w-[min(85%,48rem)] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-6';
/** The agent's replies: the vault's prose a step larger, for reading at length. */
const REPLY =
  'w-full text-[15px] leading-7 [&_pre_code]:text-[13px] [&_h1]:mt-6 [&_h2]:mt-6 [&_h3]:mt-5 [&_li]:mt-1';

/** When a message was written, as the hour and minute shown on hovering it. */
const clock = (at: string | null) =>
  at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;

/**
 * One row: the person's message as a plain bubble on the right, the agent's as Markdown, a run of
 * steps as its list, a slash command as its card. A message shows its time on hover.
 */
function ChatRow(props: {
  item: ChatEntry;
  live: boolean;
  onCopyCode: (code: string) => void;
  onKey: (key: string) => void;
  onOpenTerminal: () => void;
  /** The profile's terminal settings, whose colours command cards draw in. */
  terminal?: Config['terminal'];
}) {
  const { message, marker } = props.item;
  if (message?.from === 'steps') return <StepRun run={message} />;
  if (!message || message.from === 'command')
    return (
      <li className="flex">
        <CommandCard
          command={message?.text ?? marker?.command ?? ''}
          frame={marker?.output}
          output={message?.output}
          error={message?.error}
          live={props.live}
          onKey={props.onKey}
          onOpenTerminal={props.onOpenTerminal}
          terminal={props.terminal}
        />
      </li>
    );
  const time = clock(message.at);
  return (
    <li className={cn('group relative flex', message.from === 'you' && 'justify-end')}>
      {time && (
        <time
          dateTime={message.at ?? undefined}
          className={cn(
            '-top-5 absolute text-muted-foreground text-xs opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',
            message.from === 'you' ? 'right-1' : 'left-0',
          )}
        >
          {time}
        </time>
      )}
      {message.from === 'you' ? (
        <div className={YOU}>{message.text}</div>
      ) : (
        <div className={cn(PROSE, REPLY)}>
          <MarkdownView text={message.text} onCopyCode={props.onCopyCode} />
        </div>
      )}
    </li>
  );
}
