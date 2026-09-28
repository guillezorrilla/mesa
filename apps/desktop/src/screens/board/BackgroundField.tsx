import type { Agent } from '@mesa/core';
import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export function BackgroundField({ agent }: { agent: Agent }) {
  const id = useId();
  if (agent !== 'claude') return null;
  return (
    <div className="flex items-center gap-2 pb-2">
      <Checkbox id={id} name="background" data-testid="session-background" />
      <Label htmlFor={id} className="text-xs">
        Run in background
      </Label>
    </div>
  );
}
