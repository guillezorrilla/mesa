import type { SessionImage } from '@mesa/core';
import { ArrowUp, Plus, Square, X } from 'lucide-react';
import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Kbd } from '@/components/Kbd';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SlashMenu } from '../slash/SlashMenu';
import { useSlashMenu } from '../slash/useSlashMenu';

/**
 * Chat's composer, a card docked at the chat's foot: + attaches an image, Enter sends what is
 * typed into the session's terminal (the guarded send), Shift+Enter starts a new line, and the
 * field grows with its text up to a cap. While the agent works, an empty field's Send is Stop,
 * and Esc stops it too. The form clears once the prompt is typed.
 */
export function ChatComposer(props: {
  sessionId: string;
  acting: boolean;
  /** The agent waits on a prompt's answer: typing would not reach it. */
  answerAbove?: boolean;
  /** The image picked to send with the prompt, attached only when picked for this session. */
  image?: SessionImage;
  onPickImage?: () => void;
  onClearImage?: () => void;
  onSend: (prompt: string, form: HTMLFormElement, image?: SessionImage) => void;
  /** Takes a prompt the chat answers itself (`/model` opens its menu): true when it did, so nothing is sent. */
  onCommand?: (prompt: string) => boolean;
  /** The prompt the agent predicts comes next: dim in the empty field, Tab or Right takes it. */
  suggestion?: string;
  /** The field, for a card that gives the keys back when it closes. */
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
  /** Stop for an agent mid-turn: Send becomes Stop while the field is empty, and Esc stops it. */
  stop?: { working: boolean; stopping: boolean; onStop: () => void };
}) {
  const [text, setText] = useState('');
  const slash = useSlashMenu(props.sessionId, text, setText);
  const own = useRef<HTMLTextAreaElement>(null);
  const field = props.fieldRef ?? own;
  // shortcut: a web view without field-sizing (Safari before 26.2) grows the field here instead.
  // biome-ignore lint/correctness/useExhaustiveDependencies: it measures the field each time its text changes.
  useLayoutEffect(() => {
    const view = field.current;
    if (!view || globalThis.CSS?.supports?.('field-sizing', 'content')) return;
    view.style.height = 'auto';
    view.style.height = `${view.scrollHeight}px`;
  }, [text]);
  const image = props.image?.session === props.sessionId ? props.image : undefined;
  const ghost = !text && !props.answerAbove ? props.suggestion : undefined;
  // With a draft, Send stays: it queues behind the turn, as in Claude Desktop and orca.
  const stopping = props.stop?.working && !text.trim() && !image ? props.stop : undefined;
  const submit = (form: HTMLFormElement) => {
    const prompt = String(new FormData(form).get('prompt') ?? '');
    if (!image && props.onCommand?.(prompt)) setText('');
    else if (!props.acting && !props.answerAbove && (prompt.trim() || image)) {
      props.onSend(prompt, form, image);
      setText('');
    }
  };
  return (
    <form
      className="relative rounded-2xl bg-muted p-2 transition-shadow focus-within:ring-2 focus-within:ring-ring/40"
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
    >
      {slash.groups.length > 0 && (
        <div className="absolute inset-x-0 bottom-full mb-2">
          <SlashMenu groups={slash.groups} active={slash.active} onPick={slash.pick} />
        </div>
      )}
      {image && (
        <div className="mb-2 flex items-center gap-2 px-1 text-xs">
          <img
            src={image.dataUrl}
            alt={`Selected image: ${image.name}`}
            className="max-h-16 max-w-24 rounded-md object-contain"
          />
          <span className="min-w-0 flex-1 truncate">{image.name}</span>
          <IconButton label="Remove image" icon={X} onClick={props.onClearImage} />
        </div>
      )}
      <div className="flex items-end gap-1">
        {props.onPickImage && (
          <IconButton
            label="Attach image"
            icon={Plus}
            disabled={props.acting || props.answerAbove}
            onClick={props.onPickImage}
          />
        )}
        <Textarea
          ref={field}
          name="prompt"
          aria-label={`Message ${props.sessionId}`}
          placeholder={props.answerAbove ? 'Answer above' : (ghost ?? 'Type / for commands')}
          aria-description={ghost ? 'Suggested prompt: Tab or Right arrow takes it' : undefined}
          disabled={props.answerAbove}
          rows={1}
          autoFocus
          className="max-h-60 min-h-8 flex-1 resize-none border-0 bg-transparent px-1.5 py-1.5 shadow-none focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (slash.onKeyDown(event)) return;
            if (ghost && (event.key === 'Tab' || event.key === 'ArrowRight') && !event.shiftKey) {
              event.preventDefault();
              setText(ghost);
              return;
            }
            if (event.key === 'Escape' && props.stop?.working && !event.nativeEvent.isComposing) {
              event.preventDefault();
              props.stop.onStop();
              return;
            }
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (event.currentTarget.form) submit(event.currentTarget.form);
          }}
        />
        {ghost && <Kbd className="mb-2 shrink-0">Tab</Kbd>}
        {stopping ? (
          <Button
            type="button"
            size="icon-sm"
            className="rounded-full"
            disabled={stopping.stopping}
            aria-label={stopping.stopping ? 'Stopping' : 'Stop'}
            title="Stop (Esc)"
            // A double click's second press would cut the turn that starts next.
            onClick={(event) => event.detail < 2 && stopping.onStop()}
          >
            <Square aria-hidden className="size-3 fill-current" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon-sm"
            className="rounded-full"
            disabled={props.acting || props.answerAbove}
            aria-label="Send"
          >
            <ArrowUp aria-hidden />
          </Button>
        )}
      </div>
    </form>
  );
}
