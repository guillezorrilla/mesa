import { NotebookPen } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/** One line into the vault's log.md and today's daily note, as `mesa log` does. */
export function LogBox() {
  const run = useRun();
  const { acting, act } = useAct();
  const [last, setLast] = useState<string | null>(null);

  // One line at a time: Enter twice logs it once.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get('text') ?? '').trim();
    if (!text) return;
    act(async () => {
      const logged = await run('log.add', { text });
      if (!logged) return undefined;
      setLast(logged.entry);
      form.reset();
      return undefined;
    });
  };

  return (
    <form data-testid="log-box" onSubmit={submit} className="flex items-center gap-2">
      <Input
        name="text"
        data-testid="log-input"
        placeholder="Log a line to the vault"
        aria-label="Log a line to the vault"
        className="h-8 w-64"
      />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        data-testid="log-submit"
        disabled={acting}
      >
        <NotebookPen aria-hidden />
        Log
      </Button>
      {last && (
        <span
          data-testid="log-last"
          className="max-w-56 truncate font-mono text-muted-foreground text-xs"
        >
          {last}
        </span>
      )}
    </form>
  );
}
