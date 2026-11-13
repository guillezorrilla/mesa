import { router } from 'expo-router';
import History from 'lucide-react-native/icons/history';
import Plus from 'lucide-react-native/icons/plus';
import Search from 'lucide-react-native/icons/search';
import { useState } from 'react';
import { HeaderButton } from '@/components/HeaderButton';
import { TabHeader } from '@/components/TabHeader';
import { Input } from '@/components/ui/input';

/**
 * The Agents tab's title with Search, Past conversations and New session; Search opens a field
 * under it for `query`, and closing it clears the search.
 */
export function AgentsHeader({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (query: string) => void;
}) {
  const [searching, setSearching] = useState(false);
  const toggle = () => {
    if (searching) onQuery('');
    setSearching(!searching);
  };
  return (
    <TabHeader
      title="Agents"
      below={
        searching ? (
          // No line height: iOS sets a one-line field's text low and clips its descenders.
          <Input
            className="h-11 py-0 text-[16px]"
            autoFocus
            value={query}
            onChangeText={onQuery}
            placeholder="Search sessions"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search sessions"
          />
        ) : null
      }
    >
      <HeaderButton
        icon={Search}
        label={searching ? 'Close search' : 'Search sessions'}
        selected={searching}
        onPress={toggle}
      />
      <HeaderButton
        icon={History}
        label="Past conversations"
        onPress={() => router.push('/agents/history')}
      />
      <HeaderButton icon={Plus} label="New session" onPress={() => router.push('/agents/start')} />
    </TabHeader>
  );
}
