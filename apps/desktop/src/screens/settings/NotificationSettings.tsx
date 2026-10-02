import type { Config } from '@mesa/core';
import { AGENT_LABELS } from '@mesa/core/browser';
import { Bell, BellOff, Plug, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/lib/MesaRoot';
import type { NotificationStatus } from '@/lib/platform';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { ClearNotificationsDialog } from '../notifications/ClearNotificationsDialog';
import { Choice, Toggle } from './controls';
import { SettingRow, SettingSection } from './SettingRow';
import { useSettings } from './useSettings';

const KINDS = [
  ['inputRequired', 'Input required', 'A session asks a question or needs permission.'],
  ['finished', 'Turn finished', 'A session finished its turn.'],
  ['subagent', 'Subagent', 'A subagent a session started finished or needs permission.'],
  ['doctor', 'Doctor', 'Doctor found something to fix.'],
] as const;
const DELIVERY = [
  ['off', 'Off'],
  ['silent', 'Banner, silent'],
  ['sound', 'Banner with sound'],
] as const;

/** macOS banner permission, quiet mode, each kind's delivery, and the hooks that feed them. */
export function NotificationSettings() {
  const { config } = useSettings();
  return (
    <>
      <SettingSection
        id="notification-center"
        title="Notification Center"
        description="Notification delivery and muted kinds"
        group="Delivery"
        groupIcon={Bell}
      >
        <SystemPermission />
        <SettingRow
          icon={BellOff}
          title="Quiet mode"
          description="Hold new banners; when quiet mode ends, pending notices arrive as one digest."
          htmlFor="notifications-quiet"
          control={
            <Toggle
              id="notifications-quiet"
              path="notifications.quiet"
              checked={config.notifications.quiet}
            />
          }
        />
        {KINDS.map(([key, label, description]) => (
          <SettingRow
            key={key}
            title={label}
            description={`${description} macOS decides whether a requested sound plays.`}
            htmlFor={`notification-${key}`}
            control={
              <Choice
                id={`notification-${key}`}
                path={`notifications.${key}`}
                value={config.notifications[key as keyof Config['notifications']] as string}
                options={DELIVERY}
              />
            }
          />
        ))}
        <ClearCenter />
      </SettingSection>
      <SettingSection
        id="session-events"
        title="Session Events"
        description="Coding Agent session hooks"
      >
        <SessionHooks />
      </SettingSection>
    </>
  );
}

/** Whether macOS lets Mesa show banners, and the one request it can make. */
function SystemPermission() {
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

/** The one action that clears every notice, with the unread count it would clear. */
function ClearCenter() {
  const inbox = useCommand('notifications.list');
  const [clearing, setClearing] = useState(false);
  const items = inbox.data ?? [];
  const unread = items.filter((item) => !item.read).length;
  return (
    <>
      <SettingRow
        icon={Trash2}
        title="Clear notification center"
        description={inbox.data ? `${unread} unread` : 'Reading notices...'}
        keywords="remove notices inbox"
        control={
          <Button
            size="sm"
            variant="secondary"
            disabled={!items.length}
            onClick={() => {
              // The count the confirmation states is read now, not when Settings opened.
              void inbox.refresh().then(() => setClearing(true));
            }}
          >
            Clear
          </Button>
        }
      />
      {clearing && (
        <ClearNotificationsDialog
          count={items.length}
          unread={unread}
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

/** Mesa's hooks in each agent: what lets it tell when a session needs you. */
function SessionHooks() {
  const hooks = useCommand('hooks.status');
  const run = useRun();
  const { acting, act } = useAct();
  const agents = hooks.data
    ? ([
        [AGENT_LABELS.claude, hooks.data.installed && !hooks.data.stale],
        [AGENT_LABELS.codex, hooks.data.codex.installed && !hooks.data.codex.stale],
        [
          AGENT_LABELS.antigravity,
          hooks.data.antigravity.installed && !hooks.data.antigravity.stale,
        ],
      ] as const)
    : [];
  const ready = agents.length > 0 && agents.every(([, installed]) => installed);
  return (
    <SettingRow
      icon={Plug}
      title="Session hooks"
      description="Installs hooks into coding agents so Mesa can detect when sessions need attention."
      control={
        <Button
          size="sm"
          variant={ready ? 'ghost' : 'secondary'}
          disabled={acting || !hooks.data}
          onClick={() =>
            void act(async () => {
              const result = await run('hooks.install');
              await hooks.refresh();
              return result && said('Installed session hooks', result);
            })
          }
        >
          {ready ? 'Reinstall' : 'Install hooks'}
        </Button>
      }
    >
      <span className="flex flex-wrap gap-2">
        {agents.map(([agent, installed]) => (
          <span
            key={agent}
            className={cn(
              'rounded-full px-2 py-0.5 text-xs',
              installed ? 'bg-state-idle/15 text-state-idle' : 'bg-accent text-muted-foreground',
            )}
          >
            {agent}: {installed ? 'installed' : 'not installed'}
          </span>
        ))}
      </span>
    </SettingRow>
  );
}
