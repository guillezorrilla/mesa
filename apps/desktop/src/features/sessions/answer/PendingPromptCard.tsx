import type { PendingPrompt, PromptOption } from '@mesa/core';
import { promptTitle, typedAnswerHint } from '@mesa/core/browser';
import { Loader2, MessageCircleQuestion, ShieldQuestion } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { Kbd } from '@/components/Kbd';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PromptTextField } from './PromptTextField';
import { usePendingPrompt } from './usePendingPrompt';

/** Whether a key press came from a field being typed in, where a digit is text. */
const typing = (event: KeyboardEvent) =>
  event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

/**
 * The prompt a waiting session asks, as a card above the composer, laid out as orca's (#1222): an
 * icon and what it asks, what it is about, and its options numbered, a question's as tiles with
 * what each means. A number key picks that option; the first option takes the keys when the card
 * shows, so Enter gives it; the option pressed spins until the answer is in. A typed answer
 * where it takes one, or why Mesa cannot answer it. `prompt` is the one its chat's follow
 * streamed, else the card reads it.
 */
export function PendingPromptCard(props: {
  session: string;
  prompt?: PendingPrompt;
  className?: string;
}) {
  const { prompt, acting, pressed, answer } = usePendingPrompt(props.session, props.prompt);
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
  const byNumber = (event: KeyboardEvent) => {
    const at = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
    const option = prompt.options[at];
    if (!option || acting || typing(event) || event.metaKey || event.ctrlKey || event.altKey)
      return;
    event.preventDefault();
    void pick(option);
  };
  return (
    <section
      data-testid="session-prompt"
      aria-label={promptTitle(prompt)}
      aria-busy={acting}
      className={cn('mx-4 mt-3 grid gap-3 rounded-xl border bg-card p-4 text-sm', props.className)}
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
              // biome-ignore lint/a11y/noAutofocus: the card is what the person answers next.
              autoFocus={i === 0}
              disabled={acting}
              aria-label={option.label}
              title={option.description}
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
                  <span className="text-muted-foreground">{option.description}</span>
                )}
              </span>
            </button>
          ) : (
            <Button
              key={option.id}
              size="sm"
              variant={i === 0 ? 'default' : 'outline'}
              title={option.description}
              // biome-ignore lint/a11y/noAutofocus: the card is what the person answers next.
              autoFocus={i === 0}
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
