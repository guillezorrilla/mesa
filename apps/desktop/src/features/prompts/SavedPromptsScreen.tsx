import type { SavedPrompt } from '@mesa/core';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/** Saved prompt bodies stay literal until the user explicitly inserts one into a session. */
export function SavedPromptsScreen(props: { prompts?: SavedPrompt[]; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [remove, setRemove] = useState<string>();
  const run = useRun();
  const { acting, act } = useAct();
  const reset = () => {
    setName('');
    setText('');
    setEditing(false);
  };
  return (
    <section data-testid="saved-prompts" className="max-w-3xl space-y-4">
      <PageHeader
        title="Saved prompts"
        description="Profile-local text. Inserting a prompt never sends it."
      />
      <Card>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                if (!(await run('prompts.save', { name, text, replace: editing })))
                  return undefined;
                props.onChanged();
                reset();
                return undefined;
              });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="prompt-name">Name</Label>
              <Input
                id="prompt-name"
                value={name}
                maxLength={80}
                disabled={editing}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prompt-text">Prompt text</Label>
              <Textarea
                id="prompt-text"
                value={text}
                maxLength={20000}
                rows={6}
                onChange={(event) => setText(event.currentTarget.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={acting || !name.trim() || !text}>
                {editing ? 'Update' : 'Save'} prompt
              </Button>
              {editing && (
                <Button type="button" variant="outline" onClick={reset}>
                  Cancel edit
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {props.prompts?.map((prompt) => (
          <Card key={prompt.name}>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0 truncate font-medium">{prompt.name}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setName(prompt.name);
                    setText(prompt.text);
                    setEditing(true);
                  }}
                >
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRemove(prompt.name)}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {props.prompts?.length === 0 && <Muted>No saved prompts.</Muted>}
      </div>
      {remove && (
        <ActionDialog
          testId="delete-saved-prompt"
          title={`Delete ${remove}?`}
          description="The saved text will be removed from this profile."
          submit={{
            label: 'Delete prompt',
            testId: 'confirm-delete-prompt',
            variant: 'destructive',
            disabled: acting,
          }}
          onCancel={() => setRemove(undefined)}
          onSubmit={() =>
            void act(async () => {
              const deleted = await run('prompts.remove', { name: remove });
              if (deleted) {
                props.onChanged();
                if (editing && name === remove) reset();
                setRemove(undefined);
              }
              return undefined;
            })
          }
        >
          <p className="text-sm">{remove}</p>
        </ActionDialog>
      )}
    </section>
  );
}
