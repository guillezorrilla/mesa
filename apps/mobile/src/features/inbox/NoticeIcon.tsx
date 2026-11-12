import Bot from 'lucide-react-native/icons/bot';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import Hand from 'lucide-react-native/icons/hand';
import MessageCircleQuestion from 'lucide-react-native/icons/message-circle-question';
import Signpost from 'lucide-react-native/icons/signpost';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Stethoscope from 'lucide-react-native/icons/stethoscope';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';

/** Each Inbox kind's mark and tone; an approval asks like a question does. */
const KINDS = {
  'input-required': [MessageCircleQuestion, 'text-state-waiting'],
  approval: [Hand, 'text-state-waiting'],
  gate: [Signpost, 'text-state-waiting'],
  automation: [TriangleAlert, 'text-state-failed'],
  finished: [CircleCheck, 'text-state-done'],
  subagent: [Bot, 'text-muted-foreground'],
  doctor: [Stethoscope, 'text-muted-foreground'],
  release: [Sparkles, 'text-muted-foreground'],
} as const;

/** A notice's kind as a mark in a soft round tile; decoration, its title says what it is. */
export function NoticeIcon({ kind, approval }: { kind: string; approval: boolean }) {
  const [mark, tone] = KINDS[(approval ? 'approval' : kind) as keyof typeof KINDS] ?? KINDS.release;
  return (
    <View accessible={false} className="size-9 items-center justify-center rounded-full bg-muted">
      <Icon as={mark} className={`size-4 ${tone}`} />
    </View>
  );
}
