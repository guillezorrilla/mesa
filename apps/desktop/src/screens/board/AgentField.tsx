import { AGENT_LABELS, AGENT_NAMES, DEFAULT_AGENT } from '@mesa/core/browser';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

/** The agent a new session gets, as the form's `agent`. */
export function AgentField({ defaultValue = DEFAULT_AGENT }: { defaultValue?: string }) {
  const id = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 font-medium text-sm">Agent</legend>
      <RadioGroup name="agent" defaultValue={defaultValue} className="flex gap-6">
        {AGENT_NAMES.map((agent) => {
          return (
            <div key={agent} className="flex items-center gap-2">
              <RadioGroupItem id={`${id}-${agent}`} value={agent} />
              <Label htmlFor={`${id}-${agent}`}>{AGENT_LABELS[agent]}</Label>
            </div>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
