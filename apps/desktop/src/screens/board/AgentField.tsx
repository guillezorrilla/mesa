import { AGENT_LABELS, AGENT_NAMES, DEFAULT_AGENT } from '@mesa/core/browser';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

/**
 * The agent a new session or a skill run gets, as the form's `agent`. Headless runs support Claude
 * until #160; interactive sessions support both agents.
 */
export function AgentField({ headless = false }: { headless?: boolean }) {
  const id = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 font-medium text-sm">Agent</legend>
      <RadioGroup name="agent" defaultValue={DEFAULT_AGENT} className="flex gap-6">
        {AGENT_NAMES.map((agent) => {
          const disabled = headless && agent === 'codex';
          return (
            <div key={agent} className="flex items-center gap-2">
              <RadioGroupItem id={`${id}-${agent}`} value={agent} disabled={disabled} />
              <Label htmlFor={`${id}-${agent}`} className={disabled ? 'text-muted-foreground' : ''}>
                {AGENT_LABELS[agent]}{disabled ? ' (planned)' : ''}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
