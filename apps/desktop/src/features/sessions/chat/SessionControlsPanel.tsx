import type { ManagedRow } from '@mesa/core';
import { parsePlanUsage } from '@mesa/core/browser';
import { Gauge, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ContextRing } from '../selected/ContextRing';
import { ModelPicker } from './ModelPicker';
import { ModePicker } from './ModePicker';
import { UsagePanel } from './UsagePanel';
import { useSessionControls } from './useSessionControls';

/**
 * A Structured session's controls under Chat's composer (ADR-0029): model and effort, mode,
 * context and usage. Model and mode pick from menus as Claude Desktop's (#1222); a pick shows at
 * once with a spinner on its trigger, then the agent's confirmed value; a refusal rolls it back
 * and shows beside them. `modelOpen` lets `/model` open the model menu from the composer, and
 * closing a menu gives the keys back to it (`onReturnFocus`).
 */
export function SessionControlsPanel(props: {
  row: ManagedRow;
  items?: number;
  modelOpen?: boolean;
  onModelOpenChange?: (open: boolean) => void;
  onReturnFocus?: () => void;
}) {
  const { controls, pending, failure, apply, checkUsage } = useSessionControls(
    props.row,
    props.items,
  );
  const [checking, setChecking] = useState(false);
  if (!controls) return null;
  const usage = controls.usage ? parsePlanUsage(controls.usage) : undefined;
  return (
    <div
      data-testid="session-controls"
      className="flex flex-wrap items-center justify-end gap-1 px-1"
    >
      {failure && (
        <p role="alert" className="mr-auto truncate text-destructive text-xs" title={failure}>
          {failure}
        </p>
      )}
      <ModelPicker
        controls={controls}
        busy={pending !== undefined && pending.mode === undefined}
        open={props.modelOpen}
        onOpenChange={props.onModelOpenChange}
        onPick={(change) => void apply(change)}
        onReturnFocus={props.onReturnFocus}
      />
      {controls.modes.length > 0 && (
        <ModePicker
          controls={controls}
          busy={pending?.mode !== undefined}
          onPick={(mode) => void apply({ mode })}
          onReturnFocus={props.onReturnFocus}
        />
      )}
      <span className="px-1">
        <ContextRing context={props.row.context} />
      </span>
      {controls.agent === 'claude' && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Usage" className="size-7">
              <Gauge aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent data-testid="usage-card" align="end" className="w-96 text-xs">
            {usage ? (
              <UsagePanel report={usage} />
            ) : (
              <p className="whitespace-pre-wrap">
                {controls.usage ?? 'No usage read yet in this session.'}
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={checking}
              onClick={() => {
                setChecking(true);
                void checkUsage().finally(() => setChecking(false));
              }}
            >
              {checking && (
                <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
              )}
              Check usage
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
