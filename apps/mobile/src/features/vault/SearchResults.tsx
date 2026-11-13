import type { CallResult } from '@mesa/core/phone';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { VaultList } from './VaultList';
import { foundText } from './vaultText';

/** What a Vault search found: each item's title and first matching line, or that none matched. */
export function SearchResults({ read }: { read: Promise<MacRead<CallResult<'vaultSearch'>>> }) {
  const { result, error } = use(read);
  const hits = result?.hits ?? [];
  return (
    <Screen>
      {error ? <ErrorNote text={error} /> : null}
      {result ? <Text variant="muted">{foundText(result.total, hits.length)}</Text> : null}
      <VaultList
        items={hits.map((hit) => ({
          key: hit.path,
          title: hit.title,
          detail: hit.line ?? hit.path,
          path: hit.path,
        }))}
      />
    </Screen>
  );
}
