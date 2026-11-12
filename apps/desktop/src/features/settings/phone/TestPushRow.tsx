import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { SettingRow } from '../SettingRow';

/** Sends the paired phone a sealed test push now, whatever the idle time (`mesa phone push-test`). */
export function TestPushRow() {
  const run = useRun();
  const { acting, act } = useAct();
  const send = () =>
    act(async () =>
      (await run('phone.pushTest'))
        ? { text: 'Sent a test push to your phone', tone: 'confirmation' }
        : undefined,
    );
  return (
    <SettingRow
      icon={Send}
      title="Test push"
      description="Send the paired phone a sealed test push now, to check that pushes reach it."
      keywords="phone push test notification"
      control={
        <Button size="sm" variant="secondary" disabled={acting} onClick={send}>
          Send test push
        </Button>
      }
    />
  );
}
