import { type Agent, supportsPlanStart } from '@mesa/core/browser';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

export function SessionModeField({ agent }: { agent: Agent }) {
  if (!supportsPlanStart(agent)) return null;
  return (
    <div>
      <NativeSelect
        size="sm"
        name="mode"
        aria-label="Mode"
        defaultValue=""
        data-testid="session-mode"
        className="text-xs"
      >
        <NativeSelectOption value="">Default mode</NativeSelectOption>
        <NativeSelectOption value="plan">Plan mode</NativeSelectOption>
      </NativeSelect>
    </div>
  );
}
