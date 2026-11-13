import ArrowDown from 'lucide-react-native/icons/arrow-down';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import CornerDownLeft from 'lucide-react-native/icons/corner-down-left';
import { View } from 'react-native';
import { KeyCap } from './KeyCap';

/**
 * The keys a phone keyboard lacks, sent as keys: Ctrl, held for the next letter typed, then Esc,
 * Tab, the arrows and Enter, by tmux's names.
 */
export function KeyRow({
  ctrl,
  onCtrl,
  onKey,
}: {
  ctrl: boolean;
  onCtrl: () => void;
  onKey: (key: string) => void;
}) {
  return (
    <View className="flex-row gap-1.5">
      <KeyCap label="Ctrl" name="Control, for the next letter" on={ctrl} onPress={onCtrl} />
      <KeyCap label="Esc" name="Escape" onPress={() => onKey('Escape')} />
      <KeyCap label="Tab" name="Tab" onPress={() => onKey('Tab')} />
      <KeyCap icon={ArrowLeft} name="Left arrow" onPress={() => onKey('Left')} />
      <KeyCap icon={ArrowUp} name="Up arrow" onPress={() => onKey('Up')} />
      <KeyCap icon={ArrowDown} name="Down arrow" onPress={() => onKey('Down')} />
      <KeyCap icon={ArrowRight} name="Right arrow" onPress={() => onKey('Right')} />
      <KeyCap icon={CornerDownLeft} name="Enter" onPress={() => onKey('Enter')} />
    </View>
  );
}
