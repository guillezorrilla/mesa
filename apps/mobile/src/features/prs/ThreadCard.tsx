import type { PhoneThread } from '@mesa/core/phone';
import { View } from 'react-native';
import { PathText } from '@/components/PathText';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { threadState } from './prText';

/** One of my threads: where, my comment, the author's last reply, Reply, and Resolve or Reopen. */
export function ThreadCard({
  thread,
  onReply,
  onResolve,
}: {
  thread: PhoneThread;
  onReply: () => void;
  onResolve?: () => void;
}) {
  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <PathText path={thread.line ? `${thread.path}:${thread.line}` : thread.path} />
        </View>
        <Badge variant="secondary">
          <Text>{threadState(thread)}</Text>
        </Badge>
      </View>
      <Text selectable>{thread.body}</Text>
      {thread.lastReply ? (
        <View className="border-l-2 border-border pl-3">
          <Text className="text-xs font-medium text-muted-foreground">
            {thread.lastReply.author}
          </Text>
          <Text selectable variant="muted">
            {thread.lastReply.body}
          </Text>
        </View>
      ) : null}
      <View className="flex-row gap-2">
        <Button size="sm" variant="outline" onPress={onReply}>
          <Text>Reply</Text>
        </Button>
        {onResolve ? (
          <Button size="sm" variant="ghost" onPress={onResolve}>
            <Text>{thread.resolved ? 'Reopen' : 'Resolve'}</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
