import type { Agent, ProjectRow } from '@mesa/core';
import { supportsAgentCapability, supportsPlanStart } from '@mesa/core/browser';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { AgentField } from '@/features/sessions/fields/AgentField';
import { BackgroundField } from '@/features/sessions/fields/BackgroundField';
import { SessionModeField } from '@/features/sessions/fields/SessionModeField';
import type { OverviewState } from './useOverviewState';

/** What a session starts with: its agent, mode, goal, and the branch of its own worktree. */
export type SessionStartInput = {
  agent?: Agent;
  mode?: 'plan';
  background?: boolean;
  goal?: string;
  branch?: string;
};

/**
 * The project's goal box: one line until focused, then the agent, mode, background, and where the
 * session starts, in the main checkout or its own worktree on a new branch.
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
  return (
    <form
      data-testid="project-session-form"
      className="rounded-xl border bg-card/45 p-4 focus-within:border-ring"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const goal = (form.elements.namedItem('goal') as HTMLTextAreaElement).value;
        props.onStart({
          agent: String(values.get('agent')) as Agent,
          mode:
            supportsPlanStart(selectedAgent) && values.get('mode') === 'plan' ? 'plan' : undefined,
          background:
            supportsAgentCapability(selectedAgent, 'background') &&
            values.get('background') === 'on',
          goal,
          branch: location === 'worktree' ? String(values.get('branch') ?? '').trim() : undefined,
        });
      }}
    >
      <Label htmlFor="project-goal" className="sr-only">
        Goal (optional)
      </Label>
      <Textarea
        id="project-goal"
        name="goal"
        data-testid="project-goal"
        rows={composerOpen ? 3 : 1}
        className="min-h-12 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
        placeholder="What are we shipping? Describe your goal or paste a ticket URL..."
        onFocus={() => setComposerOpen(true)}
      />
      {composerOpen && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
          <AgentField defaultValue={project.agent ?? undefined} onValueChange={setSelectedAgent} />
          <SessionModeField agent={selectedAgent} />
          <BackgroundField agent={selectedAgent} />
          <div className="grid gap-1">
            <Label htmlFor="session-location" className="text-xs">
              Start in
            </Label>
            <NativeSelect
              id="session-location"
              value={location}
              onChange={(event) => setLocation(event.target.value as 'main' | 'worktree')}
            >
              <NativeSelectOption value="main">Main checkout</NativeSelectOption>
              <NativeSelectOption value="worktree">Own worktree</NativeSelectOption>
            </NativeSelect>
          </div>
          {location === 'worktree' && (
            <div className="grid gap-1">
              <Label htmlFor="project-branch" className="text-xs">
                Branch
              </Label>
              <Input
                id="project-branch"
                name="branch"
                data-testid="project-branch"
                required
                placeholder="feature/my-work"
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
