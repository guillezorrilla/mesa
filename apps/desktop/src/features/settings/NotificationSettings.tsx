import type { Config } from '@mesa/core';
import { BadgeAlert, Bell, BellOff } from 'lucide-react';
import { Choice } from './controls/Choice';
import { Toggle } from './controls/Toggle';
import { ClearCenter } from './notifications/ClearCenter';
import { PrEvents } from './notifications/PrEvents';
import { SessionHooks } from './notifications/SessionHooks';
import { SystemPermission } from './notifications/SystemPermission';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';
import { useSettings } from './useSettings';

const KINDS = [
  ['inputRequired', 'Input required', 'A session asks a question or needs permission.'],
  ['finished', 'Turn finished', 'A session finished its turn.'],
  ['subagent', 'Subagent', 'A subagent a session started finished or needs permission.'],
  ['doctor', 'Doctor', 'Doctor found something to fix.'],
  [
    'automation',
    'Automation failure',
    'A scheduled action failed, including a source that needs reconnecting or re-sharing.',
  ],
] as const;
const DELIVERY = [
  ['off', 'Off'],
  ['silent', 'Banner, silent'],
  ['sound', 'Banner with sound'],
] as const;

/** macOS banner permission, quiet mode, the visual alert, each kind's delivery, the hooks, and PR events. */
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
        <SettingRow
          icon={BadgeAlert}
          title="Visual alert"
          description="Show a Dock badge with the count, and a dot on the Sessions tab, while sessions wait for input."
          keywords="dock badge sidebar waiting"
          htmlFor="notifications-visual-alert"
          control={
            <Toggle
              id="notifications-visual-alert"
              path="notifications.visualAlert"
              checked={config.notifications.visualAlert}
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
        <PrEvents enabled={config.sessions.prEvents} />
      </SettingSection>
    </>
  );
}
