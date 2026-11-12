import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

/** A typed answer, for a question that takes one. */
export function PromptTextField({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const ready = !disabled && text.trim() !== '';
  return (
    <View className="gap-2">
      <Input
        value={text}
        onChangeText={setText}
        placeholder="Or type an answer"
        editable={!disabled}
        returnKeyType="send"
        onSubmitEditing={() => ready && onSubmit(text)}
        accessibilityLabel="Typed answer"
      />
      <Button variant="secondary" disabled={!ready} onPress={() => onSubmit(text)}>
        <Text>Send answer</Text>
      </Button>
    </View>
  );
}
