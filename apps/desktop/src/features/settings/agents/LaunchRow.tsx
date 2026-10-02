import type { Config } from '@mesa/core';
import { AGENT_LABELS } from '@mesa/core/browser';
import type { LucideIcon } from 'lucide-react';
import { Choice } from '../controls/Choice';
import { SettingRow } from '../SettingRow';
import { useSettings } from '../useSettings';

type Launch = Config['agents'];

/**
 * One native launch default of `agent`, in its own terms: "Use native config" leaves it unset, so
 * nothing is passed. The agent's map is saved whole, so an unset field is removed from it.
 */
export function LaunchRow<A extends keyof Launch>(props: {
  agent: A;
  field: keyof Launch[A] & string;
  title: string;
  description: string;
  icon: LucideIcon;
  options: readonly (readonly [string, string])[];
  danger?: boolean;
  /** A value that turns off the agent's checks, so the row is red while it is set. */
  dangerousValue?: string;
}) {
  const { config } = useSettings();
  const current: Record<string, unknown> = config.agents[props.agent];
  const set = current[props.field];
  const id = `launch-${props.agent}-${props.field}`;
  return (
    <SettingRow
      icon={props.icon}
      title={props.title}
      description={props.description}
      keywords={`${AGENT_LABELS[props.agent]} launch native`}
      htmlFor={id}
      tone={
        props.danger || (set !== undefined && set === props.dangerousValue) ? 'danger' : undefined
      }
      control={
        <Choice
          id={id}
          path={`agents.${props.agent}`}
          value={set === true ? 'on' : typeof set === 'string' ? set : ''}
          options={[['', 'Use native config'], ...props.options]}
          toValue={(option) => {
            const { [props.field]: _, ...rest } = current;
            return option === '' ? rest : { ...rest, [props.field]: option === 'on' || option };
          }}
        />
      }
    />
  );
}
