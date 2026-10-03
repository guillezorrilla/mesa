import { AutomationRulesPanel } from './AutomationRulesPanel';
import { useAutomations } from './useAutomations';

/** A project page's automation rules. */
export function AutomationsTab({ project }: { project: string }) {
  return <AutomationRulesPanel automations={useAutomations()} project={project} />;
}
