import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { HistoryList } from './HistoryList';
import { useHistory } from './useHistory';

/** Past conversations on the Mac, across projects: searched by their text, resumed by a tap. */
export function HistoryScreen() {
  const { history, search } = useHistory();
  return (
    <>
      <Stack.SearchBar
        placeholder="Search conversation text"
        hideWhenScrolling={false}
        onSearchButtonPress={(event) => search(event.nativeEvent.text)}
        onCancelButtonPress={() => search('')}
      />
      <Suspense fallback={<BusyScreen label="Reading past conversations..." />}>
        <HistoryList history={history} />
      </Suspense>
    </>
  );
}
