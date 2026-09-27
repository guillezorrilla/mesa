import type { Agent } from '@mesa/core';
import { Play } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useCommand } from '@/lib/useCommand';

export type NewSessionInput = { project: string; agent: Agent; goal: string; branch: string };

/**
 * The New session dialog, modal: a registered project, an agent (v1 runs Claude Code only), an
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
          agent: String(data.get('agent') ?? 'claude') as Agent,
          goal: goal.value,
          branch: String(data.get('branch') ?? ''),
        });
      }}
      onCancel={props.onCancel}
    >
      <div className="grid gap-2">
        <Label htmlFor="new-session-project">Project</Label>
        {/* ponytail: native, so the form reads it and a project whose folder is gone is a
            disabled option; shadcn's Select when the list needs search. */}
        <NativeSelect
          id="new-session-project"
          name="project"
          data-testid="new-session-project"
          required
        >
          {projects.data?.map((p) => (
            <NativeSelectOption key={p.name} value={p.name} disabled={!p.exists}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-medium text-sm">Agent</legend>
        <RadioGroup name="agent" defaultValue="claude" className="flex gap-6">
          <div className="flex items-center gap-2">
            <RadioGroupItem id="agent-claude" value="claude" />
            <Label htmlFor="agent-claude">Claude Code</Label>
          </div>
          <div className="flex items-center gap-2" title="Codex support is planned in #43">
            <RadioGroupItem id="agent-codex" value="codex" disabled />
            <Label htmlFor="agent-codex" className="text-muted-foreground">
              Codex (planned)
            </Label>
          </div>
        </RadioGroup>
      </fieldset>
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
