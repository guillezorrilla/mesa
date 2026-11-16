import type { ManagedRow } from '@mesa/core';
import { modelLabel } from '@mesa/core/browser';
import { Muted } from '@/components/Muted';
import { ModelEffortList } from './ModelEffortList';
import { useSessionControls } from './useSessionControls';

/**
 * `/model` with no name, as a picker (#1218): the footer's own model and effort list (#1213), the
 * current one checked; a pick changes it through the session's host and shows what the agent
 * confirmed, or its refusal.
 */
export function ModelCard(props: { row: ManagedRow; autoFocus: boolean }) {
  const { controls, applying, failure, apply } = useSessionControls(props.row);
  if (!controls) return <Muted size="xs">Reading the session's model</Muted>;
  return (
    <div className="flex flex-col gap-2">
      <ModelEffortList
        controls={controls}
        disabled={applying}
        autoFocus={props.autoFocus}
        wide
        className="max-w-xl rounded-md border"
        onPick={(change) => void apply(change)}
      />
      <p
        role="status"
        className={failure ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
      >
        {failure ??
          (applying
            ? 'Asking the agent'
            : `Now ${controls.model ? modelLabel(controls.model) : 'the default model'}${
                controls.effort ? `, ${controls.effortQueued ?? controls.effort} effort` : ''
              }${controls.effortQueued ? ' after this turn' : ''}`)}
      </p>
    </div>
  );
}
