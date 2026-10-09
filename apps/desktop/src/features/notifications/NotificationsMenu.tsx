import type { DoctorReport, InboxFix, InboxItem } from '@mesa/core';
import { Bell, Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Muted } from '@/components/Muted';
import { useToast, warningOf } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { codexReviewMessage, useUpdateHooks } from '@/features/hooks/useUpdateHooks';
import { useAct } from '@/lib/useAct';
import { useCall, useCommand, useRun } from '@/lib/useCommand';
import { ClearNotificationsDialog } from './ClearNotificationsDialog';
import { NotificationRow } from './NotificationRow';

/** The bell and its dropdown of notices, newest first. */
export function NotificationsMenu(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSession: (id: string) => void;
  onDoctor: () => void;
  onAutomations: () => void;
  onSettings: () => void;
  /** Runs Doctor again, which records what a fix resolved. */
  onRecheck: () => Promise<void>;
  /** Doctor's latest report: each one records its notices, so the list is read again. */
  doctor?: DoctorReport;
  /** The session open in the window: its notice is read, as the user has gone back to it. */
  session?: string;
}) {
  const inbox = useCommand('notifications.list');
  const run = useRun();
  const call = useCall();
  const update = useUpdateHooks();
  const toast = useToast();
  const { acting, act } = useAct();
  const [clearing, setClearing] = useState(false);
  const items = inbox.data ?? [];
  const unread = items.filter((item) => !item.read);
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening the menu, a session, or a new Doctor report asks for a fresh list.
  useEffect(() => {
    if (props.open || props.doctor || props.session) void inbox.refresh();
  }, [props.open, props.doctor, props.session]);
  useEffect(() => {
    const timer = window.setInterval(() => void inbox.refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [inbox.refresh]);
  const mark = async (
    name: 'notifications.read' | 'notifications.clear',
    list: InboxItem[],
    background = false,
  ) => {
    // ponytail: one call per item; the CLI marks one id at a time.
    for (const item of list) {
      const result = await call(name, { id: item.id });
      if (result.ok) continue;
      // A background read can race a newer turn of the session, which replaces its notice: the
      // notice is gone, which is no error.
      if (!background || result.error.code !== 'not_found') toast(result.error.message);
      break;
    }
    await inbox.refresh();
  };
  const seen = items.filter(
    (item) => !item.read && item.target.kind === 'session' && item.target.id === props.session,
  );
  // Each notice is marked once: a read that fails is not retried on every refresh.
  const marked = useRef(new Set<string>());
  // biome-ignore lint/correctness/useExhaustiveDependencies: each fresh list is checked once.
  useEffect(() => {
    const unmarked = seen.filter((item) => !marked.current.has(item.id));
    for (const item of unmarked) marked.current.add(item.id);
    if (unmarked.length) void mark('notifications.read', unmarked, true);
  }, [inbox.data, props.session]);
  const open = (item: InboxItem) => {
    if (!item.read) void mark('notifications.read', [item]);
    props.onOpenChange(false);
    if (item.target.kind === 'session') props.onSession(item.target.id);
    else if (item.target.kind === 'automations') props.onAutomations();
    else props.onDoctor();
  };
  /** A hooks fix, and the Codex note when it changed Codex's hooks, as the card shows it. */
  const updateHooks = async () => {
    const updated = await update();
    return updated && { data: updated.result, note: updated.codexReview };
  };
  /** What each fix runs: every kind named, so a new one cannot fall through to another's. */
  const fixes: Record<
    InboxFix,
    () => Promise<{ data: { warning?: string }; note?: string } | undefined>
  > = {
    'hooks install': updateHooks,
    'hooks update': updateHooks,
    'vault init': async () => {
      const data = await run('vault.init');
      return data && { data };
    },
  };
  const fix = (command: InboxFix) =>
    act(async () => {
      const result = await fixes[command]();
      if (!result) return undefined;
      if (result.note) {
        const note = codexReviewMessage(result.note);
        toast(note.text, note.tone);
      }
      await props.onRecheck();
      await inbox.refresh();
      return warningOf(result.data);
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
