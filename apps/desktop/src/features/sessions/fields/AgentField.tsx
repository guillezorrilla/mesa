import { AGENT_LABELS, AGENT_NAMES, type Agent, DEFAULT_AGENT } from '@mesa/core/browser';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';

/** The agent a new session gets, as the form's `agent`: one pill of segments, arrows move it. */
export function AgentField({
  defaultValue = DEFAULT_AGENT,
  onValueChange,
}: {
  defaultValue?: string;
  onValueChange?: (agent: Agent) => void;
}) {
  return (
    <RadioGroupPrimitive.Root
      name="agent"
      aria-label="Agent"
      defaultValue={defaultValue}
      onValueChange={(value) => onValueChange?.(value as Agent)}
      className="flex h-8 items-center rounded-md border bg-card p-0.5 dark:bg-input/30"
    >
      {AGENT_NAMES.map((agent) => (
        <RadioGroupPrimitive.Item
          key={agent}
          value={agent}
          className="h-full rounded px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:bg-accent data-[state=checked]:text-foreground"
        >
          {AGENT_LABELS[agent]}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
