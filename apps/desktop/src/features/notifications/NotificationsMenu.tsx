import type { DoctorReport, InboxFix, InboxItem } from '@mesa/core';
import { Bell, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { ClearNotificationsDialog } from './ClearNotificationsDialog';
import { NotificationRow } from './NotificationRow';

/** The bell and its dropdown of notices, newest first, as the reference app's notifications menu. */
export function NotificationsMenu(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSession: (id: string) => void;
  onDoctor: () => void;
  onSettings: () => void;
  /** Runs Doctor again, which records what a fix resolved. */
  onRecheck: () => Promise<void>;
  /** Doctor's latest report: each one records its notices, so the list is read again. */
  doctor?: DoctorReport;
}) {
  const inbox = useCommand('notifications.list');
  const run = useRun();
  const { acting, act } = useAct();
  const [clearing, setClearing] = useState(false);
  const items = inbox.data ?? [];
  const unread = items.filter((item) => !item.read);
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening the menu or a new Doctor report asks for a fresh list.
  useEffect(() => {
    if (props.open || props.doctor) void inbox.refresh();
  }, [props.open, props.doctor]);
  useEffect(() => {
    const timer = window.setInterval(() => void inbox.refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [inbox.refresh]);
  const mark = async (name: 'notifications.read' | 'notifications.clear', list: InboxItem[]) => {
    // ponytail: one call per item; the CLI marks one id at a time.
    for (const item of list) if (!(await run(name, { id: item.id }))) break;
    await inbox.refresh();
  };
  const open = (item: InboxItem) => {
    if (!item.read) void mark('notifications.read', [item]);
    props.onOpenChange(false);
    if (item.target.kind === 'session') props.onSession(item.target.id);
    else props.onDoctor();
  };
  const fix = (command: InboxFix) =>
    act(async () => {
      const result =
        command === 'hooks install' ? await run('hooks.install') : await run('vault.init');
      if (!result) return undefined;
      await props.onRecheck();
      await inbox.refresh();
      return said(
        command === 'hooks install' ? 'Enabled session hooks' : 'Set up the vault',
        result,
      );
    });
  return (
    <>
      <Popover open={props.open} onOpenChange={props.onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="nav-inbox"
            aria-label={unread.length ? `Notifications, ${unread.length} unread` : 'Notifications'}
            title="Notifications"
            className="relative text-muted-foreground hover:text-foreground"
          >
            <Bell aria-hidden className="size-4" />
            {unread.length > 0 && (
              <span className="absolute top-1 right-1 size-2 rounded-full bg-state-working ring-2 ring-background" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[28rem] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
          data-testid="inbox-panel"
        >
          <div className="flex items-start justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Notifications</h2>
              <Muted size="xs">{unread.length} unread</Muted>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={!unread.length}
                onClick={() => void mark('notifications.read', unread)}
              >
                Mark all read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={!items.length}
                onClick={() => {
                  props.onOpenChange(false);
                  setClearing(true);
                }}
              >
                Clear all
              </Button>
            </div>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                busy={acting}
                onOpen={open}
                onFix={(command) => void fix(command)}
                onClear={(target) => void mark('notifications.clear', [target])}
              />
            ))}
            {inbox.data && !items.length && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notices yet.
              </li>
            )}
          </ul>
          <button
            type="button"
            className="flex w-full items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => {
              props.onOpenChange(false);
              props.onSettings();
            }}
          >
            <Settings2 aria-hidden className="size-3.5" /> Notification settings
          </button>
        </PopoverContent>
      </Popover>
      {clearing && (
        <ClearNotificationsDialog
          count={items.length}
          unread={unread.length}
          onCleared={() => {
            setClearing(false);
            void inbox.refresh();
          }}
          onCancel={() => setClearing(false)}
        />
      )}
    </>
  );
}
