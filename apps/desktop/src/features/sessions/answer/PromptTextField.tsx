import { Send } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** A typed answer to a prompt that takes one, `hint` saying what it is; Send gives it. */
export function PromptTextField(props: {
  hint: string;
  disabled: boolean;
  onAnswer: (text: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <form
      className="flex gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        props.onAnswer(text);
      }}
    >
      <Input
        aria-label={props.hint}
        placeholder={props.hint}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Button type="submit" size="sm" disabled={props.disabled || !text.trim()}>
        <Send aria-hidden /> Send
      </Button>
    </form>
  );
}
