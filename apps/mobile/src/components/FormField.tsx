import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/** A form field: its label over its control, and a hint under it when there is one. */
export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium">{label}</Text>
      {children}
      {hint ? <Text variant="muted">{hint}</Text> : null}
    </View>
  );
}
