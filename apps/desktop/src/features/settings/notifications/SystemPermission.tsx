import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/lib/MesaRoot';
import type { NotificationStatus } from '@/lib/platform';
import { SettingRow } from '../SettingRow';

/** Whether macOS lets Mesa show banners, and the one request it can make. */
export function SystemPermission() {
  const { notifications } = usePlatform();
  const [status, setStatus] = useState<NotificationStatus>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void notifications.status().then(
      (value) => active && setStatus(value),
      (failure) => active && setError(String(failure)),
    );
    return () => {
      active = false;
    };
  }, [notifications]);
  return (
    <div data-testid="notification-settings">
      <SettingRow
        icon={ShieldCheck}
        title="Allow system notifications"
        description={
          <span role="status">
            {error ||
              (status
                ? `Permission: ${status.authorization}. Banners: ${status.alertsEnabled ? 'on' : 'off'}. Sounds: ${status.soundsEnabled ? 'on' : 'off'}.${status.authorization === 'denied' ? ' Enable Mesa in macOS System Settings to receive banners.' : ''}`
                : 'Checking macOS permission...')}
          </span>
        }
        keywords="macOS permission banners"
        control={
          status?.authorization === 'not-determined' && (
            <Button
              size="sm"
              onClick={() =>
                void notifications.requestPermission().then(
                  (value) => {
                    setStatus(value);
                    setError('');
                  },
                  (failure) => setError(String(failure)),
                )
              }
            >
              Enable notifications
            </Button>
          )
        }
      />
    </div>
  );
}
