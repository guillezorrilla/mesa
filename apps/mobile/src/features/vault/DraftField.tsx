import { View } from 'react-native';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** One labelled field of a decision; a long one grows over several lines. */
export function DraftField({
  label,
  value,
  onChange,
  placeholder,
  long = false,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  long?: boolean;
  disabled: boolean;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium">{label}</Text>
      <Input
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        accessibilityLabel={label}
        editable={!disabled}
        multiline={long}
        textAlignVertical={long ? 'top' : undefined}
        className={cn(long && 'min-h-24')}
      />
    </View>
  );
}
