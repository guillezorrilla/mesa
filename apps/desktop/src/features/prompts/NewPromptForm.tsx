import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/** Writes a new Saved prompt in place (`mesa prompts save`), then hands its name on. */
export function NewPromptForm(props: { onSaved: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const run = useRun();
  const { acting, act } = useAct();
  const ready = name.trim() && text.trim();
  const save = () =>
    void act(async () => {
      const saved = await run('prompts.save', { name: name.trim(), text });
      if (saved) props.onSaved(saved.name);
      return undefined;
    });
  return (
    <div
      data-testid="new-prompt-form"
      className="grid gap-2 rounded-md border border-dashed bg-muted/40 p-3"
    >
      <Input
        aria-label="Prompt name"
        placeholder="Name, such as Ticket flow"
        value={name}
        maxLength={80}
        autoFocus
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <Textarea
        aria-label="Prompt text"
        placeholder="/goal Deliver the ticket below: branch, test first, open a PR."
        value={text}
        rows={4}
        className="font-mono text-xs"
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Saved for every project. Edit it later in Settings.
        </span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!ready || acting} onClick={save}>
            Save prompt
          </Button>
        </div>
      </div>
    </div>
  );
}
