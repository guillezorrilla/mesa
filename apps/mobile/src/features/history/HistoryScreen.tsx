import { Stack } from 'expo-router';
import { useState } from 'react';
import { HistoryResults } from './HistoryResults';
import { searchQuery } from './historyText';

/** Past conversations on the Mac, across projects: searched by their text, resumed by a tap. */
export function HistoryScreen() {
  const [query, setQuery] = useState('');
  return (
    <>
      <Stack.SearchBar
        placeholder="Search conversation text"
        hideWhenScrolling={false}
        onSearchButtonPress={(event) => setQuery(searchQuery(event.nativeEvent.text))}
        onCancelButtonPress={() => setQuery('')}
      />
      <HistoryResults key={query} query={query} />
    </>
  );
}
