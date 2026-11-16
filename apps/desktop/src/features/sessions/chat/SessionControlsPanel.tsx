import type { ManagedRow } from '@mesa/core';
import { modelLabel } from '@mesa/core/browser';
import { ChevronDown, Gauge } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ContextRing } from '../selected/ContextRing';
import { ModelEffortList } from './ModelEffortList';
import { useSessionControls } from './useSessionControls';

/** A quiet footer button that opens a picker. */
function Picker(props: {
  label: string;
  children: ReactNode;
  trigger: ReactNode;
  disabled: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={props.disabled}>
        <Button
          variant="ghost"
          size="sm"
          aria-label={props.label}
          className="h-7 gap-1 px-2 text-xs"
        >
          {props.trigger}
          <ChevronDown aria-hidden className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        {props.children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A Structured session's controls under Chat's composer (ADR-0029): model and effort, permission
 * mode (Claude Code), context and usage, each opening a picker or a card. A change shows the
 * agent's confirmed value once it answers; a refusal shows beside them.
 */
export function SessionControlsPanel(props: { row: ManagedRow; items?: number }) {
  const { controls, applying, failure, apply, checkUsage } = useSessionControls(
    props.row,
    props.items,
  );
  const [modelOpen, setModelOpen] = useState(false);
  if (!controls) return null;
  const { model, effort, mode } = controls;
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
      <Popover open={modelOpen} onOpenChange={setModelOpen}>
        <PopoverTrigger asChild disabled={applying}>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Model and effort"
            className="h-7 gap-1 px-2 text-xs"
          >
            <span>{model ? modelLabel(model) : 'Model'}</span>
            {effort && (
              <span className="text-muted-foreground">
                {controls.effortQueued ? `${controls.effortQueued}, after this turn` : effort}
              </span>
            )}
            <ChevronDown aria-hidden className="size-3 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1">
          <ModelEffortList
            controls={controls}
            autoFocus
            onPick={(change) => {
              setModelOpen(false);
              void apply(change);
            }}
          />
        </PopoverContent>
      </Popover>
      {controls.modes.length > 0 && (
        <Picker label="Permission mode" disabled={applying} trigger={<span>{mode ?? 'Mode'}</span>}>
          {controls.modes.map((one) => (
            <DropdownMenuCheckboxItem
              key={one}
              checked={mode === one}
              onSelect={() => apply({ mode: one })}
            >
              {one}
            </DropdownMenuCheckboxItem>
          ))}
        </Picker>
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
          <PopoverContent data-testid="usage-card" align="end" className="w-80 text-xs">
            <p className="whitespace-pre-wrap">
              {controls.usage ?? 'No usage read yet in this session.'}
            </p>
            <Button size="sm" variant="outline" className="mt-2" onClick={checkUsage}>
              Check usage
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
