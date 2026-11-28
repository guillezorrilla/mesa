import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Investigation } from './askInvestigations';

const PROMPTS = [
  'Explain this',
  'What changed in this range?',
  'Group these',
  'Find the first occurrence',
];

/**
 * Where the person asks Claude about the logs: quick investigations, quick prompts, a question
 * (Cmd+Enter asks), and how many selected entries go with it. `draft` starts the question when it
 * changes (Ask about this).
 */
export function AskComposerField(props: {
  busy: boolean;
  selected: number;
  draft?: string;
  investigations: readonly Investigation[];
  onInvestigate: (investigation: Investigation) => void;
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
      <fieldset className="grid gap-1" aria-label="Quick investigations">
        {props.investigations.map((investigation) => {
          const Icon = investigation.icon;
          return (
            <button
              key={investigation.label}
              type="button"
              disabled={props.busy || Boolean(investigation.off)}
              title={investigation.off ?? investigation.question}
              className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background"
              onClick={() => props.onInvestigate(investigation)}
            >
              <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{investigation.label}</span>
            </button>
          );
        })}
      </fieldset>
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
            ? `Ask about the ${props.selected} selected ${props.selected === 1 ? 'entry' : 'entries'}`
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
            ? `Asks about the ${props.selected} selected ${props.selected === 1 ? 'entry' : 'entries'}`
            : 'Reads the query and its results'}
        </span>
        <Button type="submit" size="sm" disabled={props.busy || !question.trim()}>
          {props.busy ? 'Asking' : 'Ask'}
        </Button>
      </div>
    </form>
  );
}
