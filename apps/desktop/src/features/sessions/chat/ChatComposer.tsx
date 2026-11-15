import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * Chat's composer: Enter sends what is typed into the session's terminal (the guarded send),
 * Shift+Enter starts a new line. The form clears once the prompt is typed.
 */
export function ChatComposer(props: {
  sessionId: string;
  acting: boolean;
  onSend: (prompt: string, form: HTMLFormElement) => void;
}) {
  const submit = (form: HTMLFormElement) => {
    const prompt = String(new FormData(form).get('prompt') ?? '');
    if (!props.acting && prompt.trim()) props.onSend(prompt, form);
  };
  return (
    <form
      className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 pt-2 pb-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
    >
      <Textarea
        name="prompt"
        aria-label={`Message ${props.sessionId}`}
        placeholder="Message the agent"
        rows={2}
        autoFocus
        className="max-h-60 min-h-9 flex-1 resize-none"
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (event.currentTarget.form) submit(event.currentTarget.form);
        }}
      />
      <Button type="submit" size="sm" disabled={props.acting} aria-label="Send">
        <Send aria-hidden />
      </Button>
    </form>
  );
}
