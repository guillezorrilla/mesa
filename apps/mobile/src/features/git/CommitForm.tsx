import { startTransition, useActionState, useState } from 'react';
import { View } from 'react-native';
import { BusyLine } from '@/components/BusyLine';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';

/** A commit message, typed or written by an agent from what is staged, and the Commit button. */
export function CommitForm({
  pending,
  onCommit,
  write,
}: {
  pending: boolean;
  onCommit: (message: string) => void;
  write: () => Promise<MacRead<{ message: string }>>;
}) {
  const [message, setMessage] = useState('');
  const [error, writeMessage, writing] = useActionState(async () => {
    const { result, error } = await write();
    if (result) setMessage(result.message);
    return error;
  }, undefined);
  const busy = pending || writing;
  return (
    <View className="gap-2">
      <Input
        value={message}
        onChangeText={setMessage}
        placeholder="Commit message"
        multiline
        editable={!busy}
        accessibilityLabel="Commit message"
      />
      {writing ? <BusyLine label="An agent is writing the message..." /> : null}
      {error ? <ErrorNote text={error} /> : null}
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy}
          onPress={() => startTransition(() => writeMessage())}
        >
          <Text>Write it for me</Text>
        </Button>
        <Button
          className="flex-1"
          disabled={busy || !message.trim()}
          onPress={() => onCommit(message)}
        >
          <Text>Commit</Text>
        </Button>
      </View>
    </View>
  );
}
