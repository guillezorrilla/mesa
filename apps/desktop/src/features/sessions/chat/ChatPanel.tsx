import type { ChatItem, Config, SessionImage, TreeRow } from '@mesa/core';
import { ArrowDown } from 'lucide-react';
import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { AnsiLines } from '@/components/AnsiLines';
import { MarkdownView } from '@/components/MarkdownView';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { PROSE } from '@/features/vault/NoteMarkdown';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { cn } from '@/lib/utils';
import { awaitsAnswer, PromptCard } from '../answer/PromptCard';
import type { SentPrompt } from '../selected/useSessionPrompt';
import { ChatComposer } from './ChatComposer';
import { EditedFiles } from './EditedFiles';
import { MessageTime } from './MessageTime';
import { SessionControlsPanel } from './SessionControlsPanel';
import { StepRun } from './StepRun';
import { turnEdits } from './turnEdits';
import { type ChatRead, useChat } from './useChat';
import { useFollowedChat } from './useFollowedChat';

/** How near an end of the list counts as at it, in pixels. */
const NEAR = 40;
/**
 * The one column every part of the chat shares, messages to composer: the pane's width with even
 * gutters, up to a width a reply still reads at.
 */
const COLUMN = 'mx-auto w-full max-w-[78rem] px-6';

type ChatPanelProps = {
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
  /** The profile's terminal settings, whose colours a command's output draws in. */
  terminal?: Config['terminal'];
};

/** Whether a session's chat comes from its host's live stream: a Structured one (ADR-0029). */
const followedRow = (row?: TreeRow) => Boolean(row?.managed && row.view === 'structured');

/**
 * The selected session as a chat: the person's prompts and its agent's replies, oldest at the
 * top, and a composer that sends to the same session. A Structured session's chat comes from its
 * host's live stream (a reply grows as it is written); another's from its transcript. It opens at
 * the bottom and follows new replies while there; scrolled up, it holds still and offers New; at
 * the top it reads further back. A slash command shows with its output. A turn that changed files
 * closes with their card. A view switch swaps the source, as the two are separate components.
 */
export function ChatPanel(props: ChatPanelProps) {
  return followedRow(props.row) ? <FollowedChat {...props} /> : <TranscriptChat {...props} />;
}

function FollowedChat(props: ChatPanelProps) {
  return <ChatView {...props} read={useFollowedChat(props.sessionId, props.sent)} />;
}

function TranscriptChat(props: ChatPanelProps) {
  return <ChatView {...props} read={useChat(props.sessionId, props.sent)} />;
}

/** Whether `prompt` is a slash command, which shows with its output rather than as a bubble. */
const isCommand = (prompt: string) => /^\/\S/.test(prompt.trimStart());

function ChatView({ read, ...props }: ChatPanelProps & { read: ChatRead }) {
  const { chat, error, sending, loadingOlder, older } = read;
  const platform = usePlatform();
  const { act } = useAct();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  /** How far from the bottom the view was when it asked for older messages, to stay there. */
  const fromBottom = useRef<number>(undefined);
  const [fresh, setFresh] = useState(false);
  const messages = chat?.messages ?? [];
  const edited = turnEdits(messages);
  // The last item's text too: a reply growing on the live stream keeps the view at the bottom.
  const last = messages.at(-1);
  const newest = `${messages.length}:${last?.id}:${last && 'text' in last ? last.text.length : 0}:${sending?.at}`;
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
          {messages.map((message, index) => {
            const files = edited.get(message);
            return (
              // Two prompts with the same words share an id: the place tells them apart.
              // biome-ignore lint/suspicious/noArrayIndexKey: messages are stateless and only prepend.
              <Fragment key={`${index}:${message.id}`}>
                <ChatRow message={message} onCopyCode={copy} terminal={props.terminal} />
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
        <PromptCard row={props.row} className="mx-0 mt-0 rounded-xl border-0 bg-muted p-4" />
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
        {props.row?.managed && props.row.view === 'structured' && (
          <SessionControlsPanel row={props.row} />
        )}
      </div>
    </section>
  );
}

const YOU =
  'max-w-[min(85%,48rem)] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-6';
/** The agent's replies: the vault's prose a step larger for reading at length, with tables and code chips. */
const REPLY =
  'w-full text-[15px] leading-7 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_pre_code]:text-[13px] [&_h1]:mt-6 [&_h2]:mt-6 [&_h3]:mt-5 [&_li]:mt-1 [&_table]:w-full [&_tbody_tr:last-child]:border-0 [&_td]:py-2 [&_td]:pr-6 [&_td]:align-top [&_th]:py-2 [&_th]:pr-6 [&_th]:text-left [&_th]:font-medium [&_th]:whitespace-nowrap [&_tr]:border-b';

/**
 * One row: the person's message as a plain bubble on the right, the agent's as Markdown, a run of
 * steps as its list, a slash command with its output. A message shows its time on hover.
 */
function ChatRow(props: {
  message: ChatItem;
  onCopyCode: (code: string) => void;
  /** The profile's terminal settings, whose colours a command's output draws in. */
  terminal?: Config['terminal'];
}) {
  const { message } = props;
  if (message.from === 'steps') return <StepRun run={message} />;
  if (message.from === 'command')
    return (
      <li className="flex">
        <div
          data-testid="command-output"
          className="flex w-full flex-col gap-2 rounded-lg border bg-card p-3"
        >
          <code className="font-mono text-sm">{message.text}</code>
          {message.output ? (
            <AnsiLines
              lines={message.output.split('\n')}
              terminal={props.terminal}
              className={cn(message.error && 'ring-1 ring-destructive')}
            />
          ) : (
            <Muted size="xs">No output</Muted>
          )}
        </div>
      </li>
    );
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
}
