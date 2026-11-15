import { Send } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SlashMenu } from '../slash/SlashMenu';
import { useSlashMenu } from '../slash/useSlashMenu';

/**
 * Chat's composer: Enter sends what is typed into the session's terminal (the guarded send),
 * Shift+Enter starts a new line. The form clears once the prompt is typed.
 */
export function ChatComposer(props: {
  sessionId: string;
  acting: boolean;
  /** The agent waits on a prompt's answer: typing would not reach it. */
  answerAbove?: boolean;
  onSend: (prompt: string, form: HTMLFormElement) => void;
}) {
  const [text, setText] = useState('');
  const slash = useSlashMenu(props.sessionId, text, setText);
  const submit = (form: HTMLFormElement) => {
    const prompt = String(new FormData(form).get('prompt') ?? '');
    if (!props.acting && !props.answerAbove && prompt.trim()) {
      props.onSend(prompt, form);
      setText('');
    }
  };
  return (
    <form
      className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 pt-2 pb-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
    >
      <div className="relative flex-1">
        {slash.groups.length > 0 && (
          <div className="absolute inset-x-0 bottom-full mb-2">
            <SlashMenu groups={slash.groups} active={slash.active} onPick={slash.pick} />
          </div>
        )}
        <Textarea
          name="prompt"
          aria-label={`Message ${props.sessionId}`}
          placeholder={props.answerAbove ? 'Answer above' : 'Message the agent'}
          disabled={props.answerAbove}
          rows={2}
          autoFocus
          className="max-h-60 min-h-9 w-full resize-none"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (slash.onKeyDown(event)) return;
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (event.currentTarget.form) submit(event.currentTarget.form);
          }}
        />
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={props.acting || props.answerAbove}
        aria-label="Send"
      >
        <Send aria-hidden />
      </Button>
    </form>
  );
}
