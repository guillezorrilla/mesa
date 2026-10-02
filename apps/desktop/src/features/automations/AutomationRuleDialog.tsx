import type { AutomationRule } from '@mesa/core';
import { AGENT_STATES } from '@mesa/core/browser';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { ProjectSelect } from '@/features/sessions/fields/ProjectSelect';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/** A rule's trigger, action and explicit permission choice. Saving never starts it. */
export function AutomationRuleDialog(props: { onClose: () => void; onChanged: () => void }) {
  const [when, setWhen] = useState<AutomationRule['when']>('cron');
  const [action, setAction] = useState<AutomationRule['run']>('refresh');
  const projects = useCommand('projects.list');
  const run = useRun();
  const { act, acting } = useAct();
  const field = (id: string, label: string, multiline = false) => (
    <div className="space-y-1">
      <Label htmlFor={`automation-${id}`}>{label}</Label>
      {multiline ? (
        <Textarea id={`automation-${id}`} name={id} required maxLength={20000} />
      ) : (
        <Input id={`automation-${id}`} name={id} required />
      )}
    </div>
  );
  return (
    <ActionDialog
      testId="automation-rule-dialog"
      title="Add automation"
      description="Rules belong to this profile. Saving does not install the scheduler."
      submit={{
        label: 'Add rule',
        testId: 'automation-add',
        disabled: acting || !projects.data?.some((p) => p.exists),
      }}
      onCancel={props.onClose}
      onSubmit={(form) => {
        const data = new FormData(form);
        const value = (name: string) => String(data.get(name) ?? '');
        const rule: AutomationRule = {
          name: value('name'),
          project: value('project'),
          enabled: true,
          when,
          run: action,
          guardrail: value('guardrail') === 'allow' ? 'allow' : 'ask',
        };
        if (when === 'cron') rule.cron = value('cron');
        if (when === 'file') rule.file = value('file');
        if (when === 'state') rule.state = AGENT_STATES.find((s) => s === value('state'));
        if (action === 'skill') {
          rule.skill = value('skill');
          rule.args = value('args').split('\n').filter(Boolean);
        }
        if (action === 'send') {
          rule.session = value('session');
          rule.prompt = value('prompt');
        }
        if (action === 'open') rule.goal = value('goal');
        if (action === 'refresh') rule.notes = data.get('notes') === 'on';
        if (action !== 'send') rule.agent = value('agent') === 'codex' ? 'codex' : 'claude';
        void act(async () => {
          if (await run('automations.add', { rule })) {
            props.onChanged();
            props.onClose();
          }
          return undefined;
        });
      }}
    >
      {field('name', 'Name')}
      <div className="space-y-1">
        <Label htmlFor="automation-project">Project</Label>
        <ProjectSelect id="automation-project" projects={projects.data} />
      </div>
      {projects.error && (
        <p role="alert" className="text-sm text-destructive">
          {projects.error.message}
        </p>
      )}
      <div className="space-y-1">
        <Label htmlFor="automation-when">When</Label>
        <NativeSelect
          id="automation-when"
          value={when}
          onChange={(e) => setWhen(e.currentTarget.value as AutomationRule['when'])}
        >
          <option value="cron">Schedule</option>
          <option value="file">File changes</option>
          <option value="state">Session enters state</option>
        </NativeSelect>
      </div>
      {when === 'cron' && field('cron', 'Cron (minute hour day month weekday)')}
      {when === 'file' && field('file', 'File path within the project')}
      {when === 'state' && (
        <div className="space-y-1">
          <Label htmlFor="automation-state">State</Label>
          <NativeSelect id="automation-state" name="state">
            {AGENT_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="automation-run">Action</Label>
        <NativeSelect
          id="automation-run"
          value={action}
          onChange={(e) => setAction(e.currentTarget.value as AutomationRule['run'])}
        >
          <option value="refresh">Refresh imported items</option>
          <option value="skill">Run skill</option>
          <option value="send">Send prompt</option>
          <option value="open">Open session</option>
        </NativeSelect>
      </div>
      {action === 'skill' && (
        <>
          {field('skill', 'Skill name')}
          <div className="space-y-1">
            <Label htmlFor="automation-args">Arguments (one per line)</Label>
            <Textarea id="automation-args" name="args" />
          </div>
        </>
      )}
      {action === 'send' && (
        <>
          {field('session', 'Session ID')}
          {field('prompt', 'Prompt', true)}
        </>
      )}
      {action === 'open' && field('goal', 'Goal', true)}
      {action === 'refresh' && (
        <Label className="flex items-center gap-2">
          <input type="checkbox" name="notes" />
          Write notes for changed items
        </Label>
      )}
      {action !== 'send' && (
        <div className="space-y-1">
          <Label htmlFor="automation-agent">Agent</Label>
          <NativeSelect id="automation-agent" name="agent">
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
          </NativeSelect>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="automation-guardrail">Permission</Label>
        <NativeSelect id="automation-guardrail" name="guardrail">
          <option value="ask">Ask before each run</option>
          <option value="allow">Allow unattended runs</option>
        </NativeSelect>
      </div>
    </ActionDialog>
  );
}
