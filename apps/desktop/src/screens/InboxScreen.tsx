import type { Config, InboxItem } from '@mesa/core';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
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

export function InboxScreen({
  onSession,
  onDoctor,
}: {
  onSession: (id: string) => void;
  onDoctor: () => void;
}) {
  const inbox = useCommand('notifications.list');
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
  const change = async (name: 'notifications.read' | 'notifications.clear', item: InboxItem) => {
    const result = await run(name, { id: item.id });
    if (result) await inbox.refresh();
  };
  const unread = inbox.data?.filter((item) => !item.read).length ?? 0;
  return (
    <section data-testid="inbox-panel" className="space-y-4">
      <PageHeader title="Inbox" description={`${unread} unread notices from your sessions`}>
        <Button variant="outline" onClick={() => void inbox.refresh()} disabled={inbox.busy}>
          <RefreshCw aria-hidden className={inbox.busy ? 'animate-spin' : undefined} />
          Refresh
        </Button>
      </PageHeader>
      <Card className="gap-3 p-4 text-sm">
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
              void notifications
                .requestPermission()
                .then(setStatus, (error) => setStatusError(String(error)))
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
                    <NativeSelectOption value="sound">Banner and sound</NativeSelectOption>
                  </NativeSelect>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
      {inbox.data?.map((item) => (
        <Card key={item.id} className="gap-2 p-4" data-testid="inbox-item">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="text-muted-foreground text-xs">
                {item.session ? `${item.session} · ` : ''}
                {new Date(item.at).toLocaleString()} · {item.read ? 'Read' : 'Unread'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (!item.read) void change('notifications.read', item);
                  if (item.target.kind === 'session') onSession(item.target.id);
                  else onDoctor();
                }}
              >
                {item.target.kind === 'session' ? 'Open session' : 'Open Doctor'}
              </Button>
              {!item.read && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void change('notifications.read', item)}
                >
                  Mark read
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void change('notifications.clear', item)}
              >
                Clear
              </Button>
            </div>
          </div>
        </Card>
      ))}
      {inbox.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">No session notices yet.</p>
      )}
    </section>
  );
}
