import type { VaultItem } from '@mesa/core';
import { matchesVaultFilter, VAULT_CATEGORIES, VAULT_KINDS } from '@mesa/core/browser';
import { Link2Off } from 'lucide-react';
import { Fragment, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { useCommand } from '@/lib/useCommand';
import { KIND_ICONS, VaultTree } from './VaultTree';

/** Where one item is and what it is. The reader shows the item itself here in a later issue. */
function ItemDetails({ item }: { item?: VaultItem }) {
  if (!item)
    return (
      <Card data-testid="vault-item" className="p-4 text-sm text-muted-foreground">
        Select an item to see where it is and what it is.
      </Card>
    );
  const Icon = KIND_ICONS[item.kind];
  const facts: [string, string][] = [
    ['Path', item.path],
    ['Kind', item.kind],
    ['Category', item.category],
    ['Project', item.project ?? 'None'],
    ['Size', `${item.size.toLocaleString()} bytes`],
    ['Modified', item.modified],
  ];
  return (
    <Card data-testid="vault-item" className="min-w-0 gap-3 p-4">
      <h3 className="flex min-w-0 items-center gap-2 font-medium">
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{item.path.split('/').at(-1)}</span>
      </h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        {facts.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd data-fact={label} className="break-all font-mono text-xs leading-5">
              {value}
            </dd>
          </Fragment>
        ))}
      </dl>
      {item.unavailable && (
        <p data-testid="vault-item-unavailable" className="flex items-center gap-2 text-sm">
          <Link2Off aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          Unavailable: {item.unavailable}. Mesa lists it and never reads it.
        </p>
      )}
    </Card>
  );
}

/**
 * Every item in the active profile's vault (`mesa vault list`) as a folder tree, filtered by
 * project and type with core's own rule, and the selected item's details beside it.
 */
export function VaultScreen() {
  const inventory = useCommand('vault.list');
  const [project, setProject] = useState('');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<string>();
  const items = inventory.data?.items ?? [];
  const projects = [
    ...new Set(items.flatMap((item) => (item.project ? [item.project] : []))),
  ].sort();
  const shown = items.filter((item) =>
    matchesVaultFilter(item, { project: project || undefined, type: type || undefined }),
  );
  return (
    <section data-testid="vault-panel" className="space-y-4">
      <PageHeader
        title="Vault"
        description={
          inventory.data
            ? `${inventory.data.total} ${inventory.data.total === 1 ? 'item' : 'items'} in ${inventory.data.vault}`
            : "Every item in this profile's vault."
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid w-56 gap-1">
          <Label htmlFor="vault-project">Project</Label>
          <NativeSelect
            id="vault-project"
            value={project}
            onChange={(event) => setProject(event.target.value)}
          >
            <NativeSelectOption value="">All projects</NativeSelectOption>
            {projects.map((name) => (
              <NativeSelectOption key={name} value={name}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid w-56 gap-1">
          <Label htmlFor="vault-type">Type</Label>
          <NativeSelect
            id="vault-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <NativeSelectOption value="">All types</NativeSelectOption>
            <NativeSelectOptGroup label="Kind">
              {VAULT_KINDS.map((kind) => (
                <NativeSelectOption key={kind} value={kind}>
                  {kind}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
            <NativeSelectOptGroup label="Category">
              {VAULT_CATEGORIES.map((category) => (
                <NativeSelectOption key={category} value={category}>
                  {category}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
          </NativeSelect>
        </div>
        {(project || type) && inventory.data && (
          <p data-testid="vault-shown" className="pb-2 text-sm text-muted-foreground">
            {shown.length} of {inventory.data.total} shown
          </p>
        )}
      </div>
      {inventory.busy && !inventory.data ? (
        <p className="text-sm text-muted-foreground">Reading the vault...</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
          <VaultTree items={shown} selected={selected} onSelect={setSelected} />
          <ItemDetails item={items.find((item) => item.path === selected)} />
        </div>
      )}
    </section>
  );
}
