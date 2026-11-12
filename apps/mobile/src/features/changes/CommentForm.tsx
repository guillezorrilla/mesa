import { startTransition, useActionState, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { deliveryText } from './deliveryText';

type Delivery = { status: string; reason?: string };

/** A note to the session's agent on what is selected: typed, sent, and what became of it said. */
export function CommentForm({
  label,
  send,
}: {
  /** What the note is on, said over the field. */
  label: string;
  send: (comment: string) => Promise<MacRead<Delivery>>;
}) {
  const [text, setText] = useState('');
  const [said, submit, pending] = useActionState(
    async (_last: string | undefined, comment: string) => {
      const { result, error } = await send(comment);
      const words = result ? deliveryText(result) : (error ?? '');
      AccessibilityInfo.announceForAccessibility(words);
      if (result?.status === 'delivered') setText('');
      return words;
    },
    undefined,
  );
  return (
    <View className="gap-2 border-t border-border bg-background p-4">
      <Text variant="muted">{label}</Text>
      <Input
        value={text}
        onChangeText={setText}
        placeholder="Note to the agent"
        multiline
        editable={!pending}
        accessibilityLabel={`Note on ${label}`}
      />
      <Button
        disabled={pending || !text.trim()}
        onPress={() => startTransition(() => submit(text))}
      >
        <Text>{pending ? 'Sending...' : 'Send to the agent'}</Text>
      </Button>
      {said ? <Text variant="muted">{said}</Text> : null}
    </View>
  );
}
