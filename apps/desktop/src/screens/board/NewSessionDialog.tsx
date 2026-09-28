import type { Agent } from '@mesa/core';
import { DEFAULT_AGENT, supportsPlanStart } from '@mesa/core/browser';
import { Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCommand } from '@/lib/useCommand';
import { AgentField } from './AgentField';
import { BackgroundField } from './BackgroundField';
import { ProjectSelect } from './ProjectSelect';
import { SessionModeField } from './SessionModeField';

export type NewSessionInput = {
  project?: string;
  general?: boolean;
  agent?: Agent;
  mode?: 'plan';
  background?: boolean;
  goal?: string;
  branch: string;
  terminal?: boolean;
  parent?: string;
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
  general?: boolean;
  parent?: string;
  location?: 'main' | 'worktree' | 'terminal';
}) {
  const projects = useCommand('projects.list');
  const config = useCommand('config.get');
  const [agent, setAgent] = useState<Agent>(DEFAULT_AGENT);
  useEffect(() => {
    setAgent(props.general ? (config.data?.defaultAgent ?? DEFAULT_AGENT) : DEFAULT_AGENT);
  }, [props.general, config.data?.defaultAgent]);
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
          : props.general
            ? 'Starts an agent without a project in your home folder.'
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
          ...(props.general ? { general: true } : { project: String(data.get('project') ?? '') }),
          agent:
            props.location === 'terminal'
              ? undefined
              : (String(data.get('agent') ?? DEFAULT_AGENT) as Agent),
          mode: supportsPlanStart(agent) && data.get('mode') === 'plan' ? 'plan' : undefined,
          background: agent === 'claude' && data.get('background') === 'on',
          goal: goal?.value,
          branch: props.general ? '' : String(data.get('branch') ?? ''),
          terminal: props.location === 'terminal',
          ...(props.parent ? { parent: props.parent } : {}),
        });
      }}
      onCancel={props.onCancel}
    >
      {props.general ? (
        <p className="text-sm text-muted-foreground">
          General session in your home folder. Your agent handles its own trust prompt.
        </p>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="new-session-project">Project</Label>
          {props.parent ? (
            <Input
              id="new-session-project"
              name="project"
              data-testid="new-session-project"
              value={props.project}
              readOnly
            />
          ) : (
            <ProjectSelect
              id="new-session-project"
              data-testid="new-session-project"
              projects={projects.data}
              defaultValue={props.project}
            />
          )}
        </div>
      )}
      {props.location !== 'terminal' && (
        <AgentField
          key={props.general ? config.data?.defaultAgent : 'project'}
          defaultValue={props.general ? config.data?.defaultAgent : undefined}
          onValueChange={setAgent}
        />
      )}
      {props.location !== 'terminal' && <SessionModeField agent={agent} />}
      {props.location !== 'terminal' && <BackgroundField agent={agent} />}
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
      {!props.general && (
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
      )}
    </ActionDialog>
  );
}
