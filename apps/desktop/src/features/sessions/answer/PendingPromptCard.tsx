import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { PromptTextField } from './PromptTextField';
import { promptTitle } from './promptTitle';
import { usePendingPrompt } from './usePendingPrompt';

/**
 * The prompt a waiting session asks, as a card: what it is about and its options as buttons, a
 * typed answer where it takes one, or why Mesa cannot answer it.
 */
export function PendingPromptCard(props: { session: string }) {
  const { prompt, acting, answer } = usePendingPrompt(props.session);
  if (!prompt) return null;
  if (prompt.status === 'unsupported') {
    return (
      <Muted data-testid="session-prompt" className="mx-4 mt-3">
        {prompt.reason}
      </Muted>
    );
  }
  return (
    <section
      data-testid="session-prompt"
      aria-label={promptTitle(prompt)}
      className="mx-4 mt-3 grid gap-2 rounded-lg border bg-card p-3 text-sm"
    >
      <p className="font-medium">{promptTitle(prompt)}</p>
      <p className="whitespace-pre-wrap break-all font-mono text-xs">{prompt.summary}</p>
      <div className="flex flex-wrap gap-2">
        {prompt.options.map((option, i) => (
          <Button
            key={option.id}
            size="sm"
            variant={i === 0 ? 'default' : 'outline'}
            title={option.description}
            disabled={acting}
            onClick={() => answer({ option: option.id })}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {prompt.freeText && (
        <PromptTextField disabled={acting} onAnswer={(text) => answer({ text })} />
      )}
    </section>
  );
}
