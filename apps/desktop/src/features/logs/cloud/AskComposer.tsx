import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const PROMPTS = [
  'Explain this',
  'What changed since the deploy?',
  'Group these',
  'Find the first occurrence',
];

/**
 * Where the person asks Claude about the logs: quick prompts, a question (Cmd+Enter asks), and how
 * many selected entries go with it. `draft` starts the question when it changes (Ask about this).
 */
export function AskComposer(props: {
  busy: boolean;
  selected: number;
  draft?: string;
  onAsk: (question: string) => Promise<boolean>;
}) {
  const [question, setQuestion] = useState(props.draft ?? '');
  const [seen, setSeen] = useState(props.draft);
  if (props.draft !== seen) {
    setSeen(props.draft);
    setQuestion(props.draft ?? '');
  }
  const ask = async (text: string) => {
    if (await props.onAsk(text)) setQuestion('');
  };
  return (
    <form
      className="grid gap-2 border-t p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void ask(question);
      }}
    >
      <div className="flex flex-wrap gap-1">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={props.busy}
            className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => void ask(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
      <Textarea
        aria-label="Question about the logs"
        placeholder={
          props.selected
            ? `Ask about the ${props.selected} selected entries`
            : 'Ask about these entries'
        }
        className="min-h-16 text-sm"
        value={question}
        onChange={(event) => setQuestion(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void ask(question);
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {props.selected
            ? `${props.selected} selected go with it`
            : 'Reads the query and its results'}
        </span>
        <Button type="submit" size="sm" disabled={props.busy || !question.trim()}>
          {props.busy ? 'Asking' : 'Ask'}
        </Button>
      </div>
    </form>
  );
}
