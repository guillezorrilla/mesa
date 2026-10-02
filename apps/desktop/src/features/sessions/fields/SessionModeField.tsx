import { type Agent, supportsPlanStart } from '@mesa/core/browser';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

export function SessionModeField({ agent }: { agent: Agent }) {
  const id = useId();
  if (!supportsPlanStart(agent)) return null;
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">
        Mode
      </Label>
      <NativeSelect id={id} name="mode" defaultValue="" data-testid="session-mode">
        <NativeSelectOption value="">Default</NativeSelectOption>
        <NativeSelectOption value="plan">Plan</NativeSelectOption>
      </NativeSelect>
    </div>
  );
}
