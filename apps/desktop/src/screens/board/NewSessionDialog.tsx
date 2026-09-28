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

export type NewSessionInput = {
  project: string;
  agent?: Agent;
  goal?: string;
  branch: string;
  terminal?: boolean;
};

/**
 * The New session dialog, modal: a registered project, an agent (every one Mesa runs), an
 * optional goal, the agent's first prompt, and an optional branch, for its own git worktree.
 */
export function NewSessionDialog(props: {
  onOpen: (input: NewSessionInput) => void;
  onCancel: () => void;
  disabled: boolean;
  project?: string;
  location?: 'main' | 'worktree' | 'terminal';
}) {
  const projects = useCommand('projects.list');
  return (
    <ActionDialog
      testId="new-session-dialog"
      wide
      title={
        props.location === 'terminal'
          ? 'New terminal session'
          : props.location === 'worktree'
            ? 'New worktree session'
            : 'New session'
      }
      description={
        props.location === 'terminal'
          ? 'Starts a shell in the project checkout, without a coding agent.'
          : "Starts an agent in the project's tmux session."
      }
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
        const goal = form.elements.namedItem('goal') as HTMLTextAreaElement | null;
        props.onOpen({
          project: String(data.get('project') ?? ''),
          agent:
            props.location === 'terminal'
              ? undefined
              : (String(data.get('agent') ?? DEFAULT_AGENT) as Agent),
          goal: goal?.value,
          branch: String(data.get('branch') ?? ''),
          terminal: props.location === 'terminal',
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
          defaultValue={props.project}
        />
      </div>
      {props.location !== 'terminal' && <AgentField />}
      {props.location !== 'terminal' && (
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
      )}
      <div className="grid gap-2">
        <Label htmlFor="new-session-branch">
          Branch {props.location === 'worktree' ? '(required for worktree)' : '(optional)'}
        </Label>
        <Input
          id="new-session-branch"
          name="branch"
          required={props.location === 'worktree'}
          data-testid="new-session-branch"
          className="font-mono"
          placeholder="Its own git worktree on this branch, new or existing"
        />
      </div>
    </ActionDialog>
  );
}
