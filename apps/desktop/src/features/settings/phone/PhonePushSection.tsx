import { PHONE_PUSH_LABELS, PHONE_PUSH_MODES } from '@mesa/core/browser';
import { BellRing, Hourglass } from 'lucide-react';
import { ChoiceField } from '../controls/ChoiceField';
import { SettingRow } from '../SettingRow';
import { SettingSection } from '../SettingSection';
import { useSettings } from '../useSettings';

/** The idle minutes after which the person counts as away. */
const AWAY_AFTER = [
  ['1', '1 min'],
  ['5', '5 min'],
  ['10', '10 min'],
  ['15', '15 min'],
  ['30', '30 min'],
] as const;

/** When the paired phone gets a push, and how long the Mac sits idle before that counts as away (#1016). */
export function PhonePushSection() {
  const { config } = useSettings();
  return (
    <SettingSection
      id="pushes"
      title="Pushes"
      description="When the paired phone is pinged about a session"
    >
      <SettingRow
        icon={BellRing}
        title="Push to the phone"
        description="A push when a session asks a question, needs permission or finishes a turn. Its text is sealed on this Mac; the broker sees only the ciphertext."
        htmlFor="phone-push"
        keywords="phone iphone push notification away"
        control={
          <ChoiceField
            id="phone-push"
            path="phone.push"
            value={config.phone.push}
            options={PHONE_PUSH_MODES.map((mode) => [mode, PHONE_PUSH_LABELS[mode]] as const)}
          />
        }
      />
      <SettingRow
        icon={Hourglass}
        title="Away after"
        description="With pushes when away, the Mac counts you away once it has had no keyboard or pointer input this long, or its screen is locked."
        htmlFor="phone-away-after"
        keywords="idle away minutes"
        control={
          <ChoiceField
            id="phone-away-after"
            path="phone.awayAfter"
            value={String(config.phone.awayAfter)}
            options={AWAY_AFTER}
            toValue={Number}
          />
        }
      />
    </SettingSection>
  );
}
