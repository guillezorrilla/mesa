import { Section } from '@/components/Section';
import { type VaultItem, VaultList } from './VaultList';

/** A titled vault list, or nothing when it has no items. */
export function ListSection({ title, items }: { title: string; items: VaultItem[] }) {
  if (!items.length) return null;
  return (
    <Section title={title}>
      <VaultList items={items} />
    </Section>
  );
}
