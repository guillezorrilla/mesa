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
  const ready = !pending && text.trim() !== '';
  return (
    <View className="gap-3">
      <Text variant="muted">Can't scan the code? Paste its pairing link here.</Text>
      <Input
        value={text}
        onChangeText={setText}
        placeholder="mesa://pair?..."
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        textContentType="URL"
        returnKeyType="go"
        clearButtonMode="while-editing"
        editable={!pending}
        onSubmitEditing={() => ready && onSubmit(text)}
        accessibilityLabel="Pairing link"
      />
      <Button variant="secondary" disabled={!ready} onPress={() => onSubmit(text)}>
        <Text>Pair with this link</Text>
      </Button>
    </View>
  );
}
