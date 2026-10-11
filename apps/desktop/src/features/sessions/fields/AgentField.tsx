import { AGENT_LABELS, AGENT_NAMES, type Agent, DEFAULT_AGENT } from '@mesa/core/browser';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { SEGMENT, SEGMENTS } from '@/components/SegmentedControl';
import { cn } from '@/lib/utils';

/**
 * The agent a new session gets, as the form's `agent`: a radio group, so arrows move it, drawn
 * as a SegmentedControl.
 */
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
      className={cn(SEGMENTS, 'h-8')}
    >
      {AGENT_NAMES.map((agent) => (
        <RadioGroupPrimitive.Item
          key={agent}
          value={agent}
          className={cn(
            SEGMENT,
            'h-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          )}
        >
          {AGENT_LABELS[agent]}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
