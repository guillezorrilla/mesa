import { router, Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { SearchResults } from './SearchResults';
import { useVault } from './useVault';
import { VaultHome } from './VaultHome';

/** The Vault tab: today's digest and the projects, a native search over the vault, and Save. */
export function VaultScreen() {
  const vault = useVault();
  return (
    <>
      <Stack.SearchBar
        placeholder="Search the vault"
        onSearchButtonPress={(event) => vault.find(event.nativeEvent.text)}
        onCancelButtonPress={vault.clear}
        onChangeText={(event) => !event.nativeEvent.text && vault.clear()}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.pencil"
          accessibilityLabel="Save a decision"
          onPress={() => router.push('/vault/decide')}
        />
      </Stack.Toolbar>
      {vault.search ? (
        <Suspense fallback={<BusyScreen label="Searching the vault..." />}>
          <SearchResults read={vault.search} />
        </Suspense>
      ) : (
        <Suspense fallback={<BusyScreen label="Asking your Mac..." />}>
          <VaultHome read={vault.projects} />
        </Suspense>
      )}
    </>
  );
}
