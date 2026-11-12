import { PHONE_PUSH_LABELS, PHONE_PUSH_MODES, type PhonePushes } from '@mesa/core/phone';
import { Switch, View } from 'react-native';
import { ChoiceChips } from '@/components/ChoiceChips';
import { ErrorNote } from '@/components/ErrorNote';
import { FormField } from '@/components/FormField';
import { Text } from '@/components/ui/text';
import { useSetPushes } from './useSetPushes';

const MODES = PHONE_PUSH_MODES.map((mode) => [mode, PHONE_PUSH_LABELS[mode]] as const);
/** The idle minutes the Mac's Settings offers. */
const AWAY_AFTER = [1, 5, 10, 15, 30].map(
  (minutes) => [String(minutes), `${minutes} min`] as const,
);

/**
 * Which pushes this phone gets, saved on the Mac: when (#1016's away rule, and how long idle counts
 * as away), and whether a finished turn pushes too.
 */
export function PushesForm({ initial }: { initial: PhonePushes }) {
  const { pushes, change, error } = useSetPushes(initial);
  return (
    <View className="gap-5 rounded-xl border border-border bg-card p-4">
      <FormField
        label="Push to this phone"
        hint="Questions, permissions and automations that ask first. Sealed on your Mac."
      >
        <ChoiceChips
          label="Push to this phone"
          choices={MODES}
          value={pushes.push}
          onChange={(push) => change({ push })}
        />
      </FormField>
      {pushes.push === 'away' ? (
        <FormField
          label="Away after"
          hint="Your Mac counts you away once it has had no input this long, or is locked."
        >
          <ChoiceChips
            label="Away after"
            choices={AWAY_AFTER}
            value={String(pushes.awayAfter)}
            onChange={(minutes) => change({ awayAfter: Number(minutes) })}
          />
        </FormField>
      ) : null}
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="font-medium">Finished turns</Text>
          <Text variant="muted">A push when a session finishes a turn, too.</Text>
        </View>
        <Switch
          value={pushes.finished}
          disabled={pushes.push === 'never'}
          accessibilityLabel="Push finished turns"
          onValueChange={(finished) => change({ finished })}
        />
      </View>
      {error ? <ErrorNote text={error} /> : null}
    </View>
  );
}
