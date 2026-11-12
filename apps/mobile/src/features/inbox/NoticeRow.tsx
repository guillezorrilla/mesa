import { type PhoneNotice, shortAgo } from '@mesa/core/phone';
import { Pressable, View } from 'react-native';
import { StateDot } from '@/components/StateDot';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { NoticeIcon } from './NoticeIcon';

/**
 * One notice: its kind's mark, its title (bold while unread), the session it names or its detail,
 * and when. A press marks it read and opens what it names.
 */
export function NoticeRow({
  notice,
  now,
  onOpen,
}: {
  notice: PhoneNotice;
  now: number;
  onOpen: () => void;
}) {
  const about = notice.session?.title ?? notice.detail;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notice.title}${about ? `, ${about}` : ''}${notice.read ? '' : ', unread'}`}
      onPress={onOpen}
      className="min-h-16 flex-row items-start gap-3 bg-background px-4 py-3 active:bg-accent"
    >
      <NoticeIcon kind={notice.kind} />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={2} className={cn(!notice.read && 'font-semibold')}>
          {notice.title}
        </Text>
        {about ? (
          <Text numberOfLines={2} variant="muted">
            {about}
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-1.5">
        <Text variant="muted">{shortAgo(notice.at, now)}</Text>
        {notice.read ? null : <StateDot color="bg-state-unread" className="size-2" />}
      </View>
    </Pressable>
  );
}
