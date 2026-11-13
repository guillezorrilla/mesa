import { View } from 'react-native';
import { openNote } from './openNote';
import { VaultRow } from './VaultRow';

/** One item a vault list shows; one with a `path` opens that note. */
export type VaultItem = {
  key: string;
  title: string;
  stamp?: string;
  detail?: string;
  path?: string;
};

/** Vault rows under one another, hairlines between them, each opening its note. */
export function VaultList({ items }: { items: VaultItem[] }) {
  return (
    <View>
      {items.map(({ key, path, ...row }, i) => (
        <VaultRow
          key={key}
          {...row}
          first={i === 0}
          onPress={path ? () => openNote(path) : undefined}
        />
      ))}
    </View>
  );
}
