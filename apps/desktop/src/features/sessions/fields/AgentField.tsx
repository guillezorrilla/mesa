import { AGENT_LABELS, AGENT_NAMES, type Agent, DEFAULT_AGENT } from '@mesa/core/browser';
import { SegmentedControl } from '@/components/SegmentedControl';

const OPTIONS = AGENT_NAMES.map((agent) => [agent, AGENT_LABELS[agent]] as const);

/** The agent a new session gets, as the form's `agent`. */
export function AgentField({
  defaultValue = DEFAULT_AGENT,
  onValueChange,
}: {
  defaultValue?: Agent;
  onValueChange?: (agent: Agent) => void;
}) {
  return (
    <SegmentedControl
      label="Agent"
      name="agent"
      options={OPTIONS}
      defaultValue={defaultValue}
      onChange={onValueChange}
      className="h-8"
    />
  );
}
