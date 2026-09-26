import type { Agent } from '@mesa/core';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useCommand } from '@/lib/useCommand';

export type NewSessionInput = { project: string; agent: Agent; goal: string; branch: string };

// ponytail: a native select, styled as shadcn's Input: the form reads it, and a project whose
// folder is gone is a disabled option. shadcn's Select when the list needs search.
const SELECT =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

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
    <Dialog open onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent data-testid="new-session-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New session</DialogTitle>
          <DialogDescription>Starts an agent in the project's tmux session.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            // The textarea's own value: form data may turn its newlines into CRLF.
            const goal = e.currentTarget.elements.namedItem('goal') as HTMLTextAreaElement;
            props.onOpen({
              project: String(form.get('project') ?? ''),
              agent: 'claude',
              goal: goal.value,
              branch: String(form.get('branch') ?? ''),
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="new-session-project">Project</Label>
            <select
              id="new-session-project"
              name="project"
              data-testid="new-session-project"
              required
              className={SELECT}
            >
              {projects.data?.map((p) => (
                <option key={p.name} value={p.name} disabled={!p.exists}>
                  {p.name}
                </option>
              ))}
            </select>
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onCancel}>
              Cancel
            </Button>
            <Button type="submit" data-testid="new-session-submit" disabled={props.disabled}>
              <Play aria-hidden />
              Open
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
