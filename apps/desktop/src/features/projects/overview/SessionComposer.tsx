import type { Agent, ProjectRow } from '@mesa/core';
import { supportsAgentCapability, supportsPlanStart } from '@mesa/core/browser';
import { Play, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { IconButton } from '@/components/IconButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { AdditionalProjectsField } from '@/features/sessions/fields/AdditionalProjectsField';
import { AgentField } from '@/features/sessions/fields/AgentField';
import { BackgroundField } from '@/features/sessions/fields/BackgroundField';
import { SessionModeField } from '@/features/sessions/fields/SessionModeField';
import { useCommand } from '@/lib/useCommand';
import type { OverviewState } from './useOverviewState';

/** What a session starts with: its agent, mode, goal, and the branch of its own worktree. */
export type SessionStartInput = {
  agent?: Agent;
  mode?: 'plan';
  background?: boolean;
  goal?: string;
  branch?: string;
  /** Its own worktree on a branch Mesa names: with `with` and no branch. */
  worktree?: boolean;
  /** The other projects it also works in, each in a worktree on its branch. */
  with?: string[];
  /** The imported item it starts from (Start session in the Import panel). */
  from?: string;
};

/**
 * The project's goal box: one line until focused, then the agent, mode, background, other
 * projects it also works in, and where the session starts, in the main checkout or its own
 * worktree on a new branch (always, with another project, on a branch Mesa names unless given).
 * Filled in from an imported item, it names the item, and the session keeps it, until cleared.
 */
export function SessionComposer(props: {
  project: ProjectRow;
  state: OverviewState;
  busy: boolean;
  onStart: (input: SessionStartInput) => void;
}) {
  const { project } = props;
  const { location, setLocation, composerOpen, setComposerOpen, selectedAgent, setSelectedAgent } =
    props.state;
  const { draft, setDraft } = props.state;
  const projects = useCommand('projects.list').data;
  const { additional: chosen, setAdditional: setChosen } = props.state;
  // The field is hidden for an agent that cannot add a folder, and sends nothing then.
  const extra = supportsAgentCapability(selectedAgent, 'addDir') ? chosen : [];
  const where = extra.length ? 'worktree' : location;
  const goalBox = useRef<HTMLTextAreaElement>(null);
  // Focused when an item fills it in, which opens the composer.
  useEffect(() => {
    if (draft) goalBox.current?.focus();
  }, [draft]);
  return (
    <form
      data-testid="project-session-form"
      className="rounded-xl border bg-card/45 p-4 focus-within:border-ring"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const goal = (form.elements.namedItem('goal') as HTMLTextAreaElement).value;
        const branch = where === 'worktree' ? String(values.get('branch') ?? '').trim() : '';
        props.onStart({
          agent: String(values.get('agent')) as Agent,
          mode:
            supportsPlanStart(selectedAgent) && values.get('mode') === 'plan' ? 'plan' : undefined,
          background:
            supportsAgentCapability(selectedAgent, 'background') &&
            values.get('background') === 'on',
          goal,
          branch: branch || undefined,
          ...(extra.length ? { with: extra, ...(branch ? {} : { worktree: true }) } : {}),
          from: draft?.from,
        });
      }}
    >
      {draft && (
        <div
          data-testid="project-goal-from"
          className="mb-2 flex min-w-0 items-center gap-2 text-sm"
        >
          <Badge variant="secondary">From</Badge>
          <span className="min-w-0 flex-1 truncate">{draft.title}</span>
          <IconButton label="Clear the item" icon={X} onClick={() => setDraft(undefined)} />
        </div>
      )}
      <Label htmlFor="project-goal" className="sr-only">
        Goal (optional)
      </Label>
      <Textarea
        // A new item's goal fills it in again; clearing it empties it.
        key={draft?.from ?? ''}
        ref={goalBox}
        defaultValue={draft?.goal}
        id="project-goal"
        name="goal"
        data-testid="project-goal"
        rows={composerOpen ? (draft ? 6 : 3) : 1}
        className="min-h-12 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
        placeholder="What are we shipping? Describe your goal or paste a ticket URL..."
        onFocus={() => setComposerOpen(true)}
      />
      {composerOpen && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
          <AgentField defaultValue={project.agent ?? undefined} onValueChange={setSelectedAgent} />
          <SessionModeField agent={selectedAgent} />
          <BackgroundField agent={selectedAgent} />
          <AdditionalProjectsField
            agent={selectedAgent}
            project={project.name}
            projects={projects}
            value={chosen}
            onChange={setChosen}
          />
          <div className="grid gap-1">
            <Label htmlFor="session-location" className="text-xs">
              Start in
            </Label>
            <NativeSelect
              id="session-location"
              value={where}
              disabled={extra.length > 0}
              onChange={(event) => setLocation(event.target.value as 'main' | 'worktree')}
            >
              <NativeSelectOption value="main">Main checkout</NativeSelectOption>
              <NativeSelectOption value="worktree">Own worktree</NativeSelectOption>
            </NativeSelect>
          </div>
          {where === 'worktree' && (
            <div className="grid gap-1">
              <Label htmlFor="project-branch" className="text-xs">
                Branch
              </Label>
              <Input
                id="project-branch"
                name="branch"
                data-testid="project-branch"
                required={!extra.length}
                placeholder={extra.length ? 'Mesa names one' : 'feature/my-work'}
              />
            </div>
          )}
          <Button className="ml-auto" type="submit" disabled={!project.exists || props.busy}>
            <Play aria-hidden /> Start session
          </Button>
        </div>
      )}
    </form>
  );
}
