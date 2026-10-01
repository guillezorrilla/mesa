import type { Config } from '@mesa/core';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { usePlatform } from '@/lib/MesaRoot';
import type { NotificationStatus } from '@/lib/platform';
import { useCommand, useRun } from '@/lib/useCommand';

const KINDS = [
  ['inputRequired', 'Input required'],
  ['finished', 'Turn finished'],
  ['subagent', 'Subagent'],
  ['doctor', 'Doctor'],
] as const;

/** macOS banner permission, quiet mode, and how each kind of notice is delivered. */
export function NotificationSettings() {
  const config = useCommand('config.get');
  const { notifications } = usePlatform();
  const run = useRun();
  const [status, setStatus] = useState<NotificationStatus>();
  const [statusError, setStatusError] = useState('');
  useEffect(() => {
    let active = true;
    void notifications.status().then(
      (value) => active && setStatus(value),
      (error) => active && setStatusError(String(error)),
    );
    return () => {
      active = false;
    };
  }, [notifications]);
  const setting = async (key: keyof Config['notifications'], value: string | boolean) => {
    const changed = await run('config.set', { path: `notifications.${key}`, value });
    if (changed) await config.refresh();
  };
  return (
    <Card className="gap-3 p-4 text-sm" data-testid="notification-settings">
      <h3 className="font-medium">macOS notifications</h3>
      <p role="status" className="text-muted-foreground">
        {statusError ||
          (status
            ? `Permission: ${status.authorization}. Banners: ${status.alertsEnabled ? 'on' : 'off'}. Sounds: ${status.soundsEnabled ? 'on' : 'off'}.`
            : 'Checking macOS permission...')}
      </p>
      {status?.authorization === 'not-determined' && (
        <Button
          size="sm"
          className="w-fit"
          onClick={() =>
            void notifications.requestPermission().then(
              (value) => {
                setStatus(value);
                setStatusError('');
              },
              (error) => setStatusError(String(error)),
            )
          }
        >
          Enable notifications
        </Button>
      )}
      {status?.authorization === 'denied' && (
        <p className="text-muted-foreground">
          Enable Mesa in macOS System Settings to receive banners.
        </p>
      )}
      {config.data && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            aria-pressed={config.data.notifications.quiet}
            onClick={() => void setting('quiet', !config.data?.notifications.quiet)}
          >
            Quiet mode {config.data.notifications.quiet ? 'on' : 'off'}
          </Button>
          <p className="text-muted-foreground">
            Quiet mode holds new banners. When it ends, pending notices arrive as one digest.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {KINDS.map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`notification-${key}`}>{label}</Label>
                <NativeSelect
                  id={`notification-${key}`}
                  value={config.data?.notifications[key]}
                  onChange={(event) => void setting(key, event.target.value)}
                >
                  <NativeSelectOption value="off">Off</NativeSelectOption>
                  <NativeSelectOption value="silent">Banner, silent</NativeSelectOption>
                  <NativeSelectOption value="sound">Banner, request sound</NativeSelectOption>
                </NativeSelect>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground">macOS controls whether requested sounds play.</p>
        </>
      )}
    </Card>
  );
}
