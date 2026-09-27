import type { Agent } from '@mesa/core';
import { DEFAULT_AGENT } from '@mesa/core/browser';
import { Play } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCommand } from '@/lib/useCommand';
import { AgentField } from './AgentField';
import { ProjectSelect } from './ProjectSelect';

export type NewSessionInput = { project: string; agent: Agent; goal: string; branch: string };

/**
 * The New session dialog, modal: a registered project, an agent (every one Mesa runs), an
 * optional goal, the agent's first prompt, and an optional branch, for its own git worktree.
 */
export function NewSessionDialog(props: {
  onOpen: (input: NewSessionInput) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const projects = useCommand('projects.list');
  return (
    <ActionDialog
      testId="new-session-dialog"
      wide
      title="New session"
      description="Starts an agent in the project's tmux session."
      submit={{
        label: (
          <>
            <Play aria-hidden />
            Open
          </>
        ),
        testId: 'new-session-submit',
        disabled: props.disabled,
      }}
      onSubmit={(form) => {
        const data = new FormData(form);
        // The textarea's own value: form data may turn its newlines into CRLF.
        const goal = form.elements.namedItem('goal') as HTMLTextAreaElement;
        props.onOpen({
          project: String(data.get('project') ?? ''),
          agent: String(data.get('agent') ?? DEFAULT_AGENT) as Agent,
          goal: goal.value,
          branch: String(data.get('branch') ?? ''),
        });
      }}
      onCancel={props.onCancel}
    >
      <div className="grid gap-2">
        <Label htmlFor="new-session-project">Project</Label>
        <ProjectSelect
          id="new-session-project"
          data-testid="new-session-project"
          projects={projects.data}
        />
      </div>
      <AgentField />
      <div className="grid gap-2">
        <Label htmlFor="new-session-goal">Goal (optional)</Label>
        <Textarea
          id="new-session-goal"
          name="goal"
          data-testid="new-session-goal"
          rows={4}
          placeholder="The first prompt; /goal keeps the agent working until its condition holds"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-session-branch">Branch (optional)</Label>
        <Input
          id="new-session-branch"
          name="branch"
          data-testid="new-session-branch"
          className="font-mono"
          placeholder="Its own git worktree on this branch, new or existing"
        />
      </div>
    </ActionDialog>
  );
}
