import type { PendingPrompt, PromptOption } from '@mesa/core';
import { promptTitle, typedAnswerHint } from '@mesa/core/browser';
import { Loader2, MessageCircleQuestion, ShieldQuestion } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { Kbd } from '@/components/Kbd';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { numberKey } from '@/lib/numberKey';
import { cn } from '@/lib/utils';
import { PromptTextField } from './PromptTextField';
import { usePendingPrompt } from './usePendingPrompt';

/**
 * The prompt a waiting session asks, as a card above the composer, laid out as orca's (#1222): an
 * icon and what it asks, what it is about, and its options numbered, a question's as tiles with
 * what each means. The card takes the keys when it shows, so a key meant for the composer answers
 * nothing; a number key selects that option and Enter gives it (orca's select, then confirm); the
 * option pressed spins until the answer is in. A typed answer
 * where it takes one, or why Mesa cannot answer it. `prompt` is the one its chat's follow
 * streamed, else the card reads it.
 */
export function PendingPromptCard(props: {
  session: string;
  prompt?: PendingPrompt;
  className?: string;
}) {
  const { prompt, acting, pressed, answer } = usePendingPrompt(props.session, props.prompt);
  const card = useRef<HTMLElement>(null);
  const shown = prompt?.status === 'pending' ? prompt.id : undefined;
  useEffect(() => {
    if (shown) card.current?.focus();
  }, [shown]);
  if (!prompt) return null;
  if (prompt.status === 'unsupported') {
    return (
      <Muted data-testid="session-prompt" className={cn('mx-4 mt-3', props.className)}>
        {prompt.reason}
      </Muted>
    );
  }
  const question = prompt.kind === 'question';
  const Icon = question ? MessageCircleQuestion : ShieldQuestion;
  const pick = (option: PromptOption) => answer({ option: option.id });
  const byNumber = (event: KeyboardEvent<HTMLElement>) => {
    const at = numberKey(event);
    if (at === undefined || at >= prompt.options.length) return;
    event.preventDefault();
    event.currentTarget.querySelectorAll<HTMLElement>('[data-option]')[at]?.focus();
  };
  return (
    <section
      ref={card}
      tabIndex={-1}
      data-testid="session-prompt"
      aria-label={promptTitle(prompt)}
      aria-busy={acting}
      className={cn(
        'mx-4 mt-3 grid gap-3 rounded-xl border bg-card p-4 text-sm outline-none',
        props.className,
      )}
      onKeyDown={byNumber}
    >
      <header className="flex items-center gap-2">
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <p className="line-clamp-2 font-semibold">
          {question ? prompt.summary : promptTitle(prompt)}
        </p>
      </header>
      {!question && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
          {prompt.summary}
        </pre>
      )}
      <div className={question ? 'grid gap-1.5' : 'flex flex-wrap gap-2'}>
        {prompt.options.map((option, i) =>
          question ? (
            <button
              key={option.id}
              type="button"
              data-option
              disabled={acting}
              aria-label={option.label}
              aria-describedby={`${prompt.id}-${option.id}`}
              aria-busy={pressed === option.id}
              className="flex items-start gap-3 rounded-lg border px-3 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              onClick={() => void pick(option)}
            >
              <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded border text-muted-foreground text-xs tabular-nums">
                {pressed === option.id ? (
                  <Loader2 aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />
                ) : (
                  i + 1
                )}
              </span>
              <span className="grid gap-0.5">
                <span className="font-medium">{option.label}</span>
                {option.description && option.description !== option.label && (
                  <span id={`${prompt.id}-${option.id}`} className="text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </span>
            </button>
          ) : (
            <Button
              key={option.id}
              size="sm"
              variant={i === 0 ? 'default' : 'outline'}
              title={option.description}
              data-option
              disabled={acting}
              aria-label={option.label}
              aria-busy={pressed === option.id}
              onClick={() => void pick(option)}
            >
              {pressed === option.id && (
                <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
              )}
              {option.label}
              <Kbd className="ml-1 opacity-70">{i + 1}</Kbd>
            </Button>
          ),
        )}
      </div>
      {prompt.freeText && (
        <PromptTextField
          hint={typedAnswerHint(prompt)}
          disabled={acting}
          onAnswer={(text) => answer({ text })}
        />
      )}
    </section>
  );
}
