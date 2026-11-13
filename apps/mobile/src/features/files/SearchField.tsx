import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

/** A search of the worktree's file names, or of their text when the switch is on. */
export function SearchField({
  inText,
  onInText,
  onSearch,
}: {
  inText: boolean;
  onInText: (inText: boolean) => void;
  onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState('');
  return (
    <View className="gap-2">
      <Input
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          if (!text) onSearch('');
        }}
        placeholder={inText ? 'Search the files' : 'Search file names'}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        onSubmitEditing={() => onSearch(query)}
        accessibilityLabel="Search"
      />
      <View className="flex-row items-center justify-between">
        <Text variant="muted">Search inside files</Text>
        <Switch value={inText} onValueChange={onInText} accessibilityLabel="Search inside files" />
      </View>
    </View>
  );
}
