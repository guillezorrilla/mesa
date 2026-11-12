import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

/** A pairing link typed or pasted instead of scanned, for a Mac whose QR the camera can't see. */
export function PasteLinkField({
  onSubmit,
  pending,
}: {
  onSubmit: (text: string) => void;
  pending: boolean;
}) {
  const [text, setText] = useState('');
  return (
    <View className="gap-2">
      <Input
        value={text}
        onChangeText={setText}
        placeholder="mesa://pair?..."
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Pairing link"
      />
      <Button variant="secondary" disabled={pending || !text.trim()} onPress={() => onSubmit(text)}>
        <Text>Pair with this link</Text>
      </Button>
    </View>
  );
}
