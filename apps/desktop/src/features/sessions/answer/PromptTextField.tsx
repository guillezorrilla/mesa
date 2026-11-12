import { Send } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** A typed answer to a question that takes one; Send gives it. */
export function PromptTextField(props: { disabled: boolean; onAnswer: (text: string) => void }) {
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
        aria-label="Type an answer"
        placeholder="Or type an answer"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Button type="submit" size="sm" disabled={props.disabled || !text.trim()}>
        <Send aria-hidden /> Send
      </Button>
    </form>
  );
}
