import type { Agent } from '@mesa/core';
import { supportsAgentCapability } from '@mesa/core/browser';
import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export function BackgroundField({ agent }: { agent: Agent }) {
  const id = useId();
  if (!supportsAgentCapability(agent, 'background')) return null;
  return (
    <div className="flex h-8 items-center gap-2 rounded-md border px-2.5 dark:bg-input/30">
      <Checkbox id={id} name="background" data-testid="session-background" />
      <Label htmlFor={id} className="text-xs font-normal">
        Run in background
      </Label>
    </div>
  );
}
