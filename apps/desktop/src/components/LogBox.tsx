import { type FormEvent, useState } from 'react';
import { useRun } from '../lib/useCommand';

/** One line into the vault's log.md and today's daily note, as `mesa log` does. */
export function LogBox() {
  const run = useRun();
  const [last, setLast] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get('text') ?? '').trim();
    if (!text) return;
    const logged = await run('log.add', { text });
    if (logged) {
      setLast(logged.entry);
      form.reset();
    }
  };

  return (
    <form data-testid="log-box" onSubmit={submit}>
      <input name="text" data-testid="log-input" placeholder="Log a line to the vault" />
      <button type="submit" data-testid="log-submit">
        Log
      </button>
      {last && <span data-testid="log-last">{last}</span>}
    </form>
  );
}
