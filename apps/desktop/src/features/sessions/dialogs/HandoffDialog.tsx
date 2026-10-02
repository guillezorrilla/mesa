import type { Agent, ManagedRow } from '@mesa/core';
import { AGENT_LABELS, AGENT_NAMES, sessionLabel } from '@mesa/core/browser';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { usePlatform } from '@/lib/MesaRoot';

/**
 * Asks for the handoff note (a file) and hands the session off: a successor starts with its goal
 * and the note, and the session stops unless kept. One in its own worktree cannot be kept, as its
 * successor takes the worktree over.
 */
export function HandoffDialog(props: {
  row: ManagedRow;
  /** The successor agent chosen already (a swap of a session with a conversation). */
  agent?: Agent;
  disabled: boolean;
  onHandoff: (note: string, keep: boolean, agent?: Agent) => void;
  onCancel: () => void;
}) {
  const platform = usePlatform();
  const [note, setNote] = useState<string>();
  const [keep, setKeep] = useState(false);
  const [agent, setAgent] = useState<Agent | ''>(props.agent ?? '');
  const { row } = props;
  return (
    <ActionDialog
      testId="handoff-dialog"
      title={`Hand off ${sessionLabel(row)}`}
      description={`A successor starts on ${row.project} with its goal and your note, and reads the note first.`}
      submit={{ label: 'Hand off', testId: 'handoff-submit', disabled: !note || props.disabled }}
      onSubmit={() => note && props.onHandoff(note, keep, agent || undefined)}
      onCancel={props.onCancel}
    >
      <div className="grid gap-2">
        <Label htmlFor="handoff-agent">Successor agent</Label>
        <NativeSelect
          id="handoff-agent"
          data-testid="handoff-agent"
          value={agent}
          onChange={(event) => setAgent(event.target.value as Agent | '')}
        >
          <NativeSelectOption value="">
            Same agent ({AGENT_LABELS[row.agent as Agent]})
          </NativeSelectOption>
          {AGENT_NAMES.map((name) => (
            <NativeSelectOption key={name} value={name}>
              {AGENT_LABELS[name]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="handoff-pick">Handoff note</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            id="handoff-pick"
            data-testid="handoff-pick"
            onClick={async () => setNote((await platform.pickFile()) ?? note)}
          >
            <FileText aria-hidden />
            Pick note
          </Button>
          <span
            data-testid="handoff-note"
            title={note}
            className="truncate font-mono text-muted-foreground text-xs"
          >
            {note ?? 'what is verified, assumed, left out, and blocked'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="handoff-keep"
          data-testid="handoff-keep"
          checked={keep}
          disabled={Boolean(row.worktree)}
          onCheckedChange={(checked) => setKeep(checked === true)}
        />
        <Label htmlFor="handoff-keep" className="font-normal">
          {row.worktree ? 'It stops: its successor takes over its worktree' : 'Keep it running'}
        </Label>
      </div>
    </ActionDialog>
  );
}
