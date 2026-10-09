import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/**
 * The ticket prompt (CONTEXT.md, Ticket prompt): the Saved prompt every ticket session gets, for
 * all projects, and this project's own over it.
 */
export function TicketPromptFields(props: {
  project: string;
  /** The prompt a ticket session on this project gets now. */
  prompt: string | null;
  projectPrompt: string | null;
  onChanged: () => void;
}) {
  const prompts = useCommand('prompts.list');
  const run = useRun();
  const { acting, act } = useAct();
  // The profile's prompt is the one in force when the project names none of its own.
  const profilePrompt = props.projectPrompt ? undefined : props.prompt;
  const set = (name: string, project?: string) =>
    void act(async () => {
      if (
        await run('tickets.prompt', { ...(name ? { name } : {}), ...(project ? { project } : {}) })
      )
        props.onChanged();
      return undefined;
    });
  const names = prompts.data?.map((prompt) => prompt.name) ?? [];
  return (
    <section aria-label="Ticket prompt" className="space-y-3">
      <SectionLabel>Ticket prompt</SectionLabel>
      <Muted>A Saved prompt added to the goal of every session started from a ticket.</Muted>
      <div className="flex flex-wrap gap-6">
        <Label className="flex items-center gap-2 text-sm font-normal">
          This project
          <NativeSelect
            aria-label="This project's ticket prompt"
            className="min-w-48"
            value={props.projectPrompt ?? ''}
            disabled={acting}
            onChange={(event) => set(event.currentTarget.value, props.project)}
          >
            <NativeSelectOption value="">Use the default</NativeSelectOption>
            {names.map((name) => (
              <NativeSelectOption key={name} value={name}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Label>
        {profilePrompt !== undefined && (
          <Label className="flex items-center gap-2 text-sm font-normal">
            Default, all projects
            <NativeSelect
              aria-label="Default ticket prompt"
              className="min-w-48"
              value={profilePrompt ?? ''}
              disabled={acting}
              onChange={(event) => set(event.currentTarget.value)}
            >
              <NativeSelectOption value="">None</NativeSelectOption>
              {names.map((name) => (
                <NativeSelectOption key={name} value={name}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Label>
        )}
      </div>
      {prompts.data && !names.length && (
        <Muted>Save a prompt in Settings &gt; Saved prompts to choose one here.</Muted>
      )}
    </section>
  );
}
