import type { VaultInventory, VaultItem } from '@mesa/core';
import { matchesVaultFilter, VAULT_CATEGORIES, VAULT_KINDS } from '@mesa/core/browser';
import { FileText, Link2Off, Search } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { VaultReader } from './VaultReader';
import { VaultSearchResults } from './VaultSearchResults';
import { KIND_ICONS, VaultTree } from './VaultTree';

/**
 * Where the selected item is and what it is, then the item itself in the reader, unless
 * unavailable; a selected item the vault no longer lists says so.
 */
function ItemDetails(props: {
  selected?: string;
  item?: VaultItem;
  looks: number;
  onSelect: (path: string) => void;
}) {
  const { item, onSelect } = props;
  if (!item)
    return (
      <div
        data-testid="vault-item"
        className="grid min-w-0 flex-1 place-items-center p-8 text-center text-sm text-muted-foreground"
      >
        <div className="space-y-3">
          <FileText aria-hidden className="mx-auto size-10 opacity-40" />
          <p>
            {props.selected
              ? `This item no longer exists: ${props.selected}.`
              : 'Select an item to read it here.'}
          </p>
        </div>
      </div>
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
    <article data-testid="vault-item" className="flex min-w-0 flex-1 flex-col">
      <h3 className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5 text-sm font-medium">
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{item.path.split('/').at(-1)}</span>
      </h3>
      <dl className="flex shrink-0 flex-wrap gap-x-5 gap-y-1 border-b px-4 py-2 text-xs">
        {facts.map(([label, value]) => (
          <div key={label} className="flex min-w-0 max-w-full gap-1.5">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd data-fact={label} className="truncate font-mono" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {item.unavailable ? (
          <p data-testid="vault-item-unavailable" className="flex items-center gap-2 text-sm">
            <Link2Off aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            Unavailable: {item.unavailable}. Mesa lists it and never reads it.
          </p>
        ) : (
          <VaultReader path={item.path} looks={props.looks} onSelect={onSelect} />
        )}
      </div>
    </article>
  );
}

/**
 * One vault's inventory as a folder tree, filtered by project and type with core's own rule, and
 * the selected item's details and reader beside it, with selection owned by the Vault screen. A
 * search (`mesa vault search`, from `query` at first) shows its results in the tree's place.
 */
export function VaultBrowser({
  inventory,
  looks,
  query: initial,
  selected,
  onSelect,
}: {
  inventory: VaultInventory;
  looks: number;
  query: string;
  selected?: string;
  onSelect: (path: string) => void;
}) {
  const [project, setProject] = useState('');
  const [type, setType] = useState('');
  const [draft, setDraft] = useState(initial);
  const [query, setQuery] = useState(initial.trim());
  const items = inventory.items;
  const projects = [
    ...new Set(items.flatMap((item) => (item.project ? [item.project] : []))),
  ].sort();
  const shown = items.filter((item) =>
    matchesVaultFilter(item, { project: project || undefined, type: type || undefined }),
  );
  return (
    <section
      aria-label="Vault browser"
      className="flex h-[calc(100vh-17rem)] min-h-[30rem] flex-col overflow-hidden rounded-lg border bg-card/40"
    >
      <form
        className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(draft.trim());
        }}
      >
        <label className="flex w-80 items-center gap-2 rounded-lg bg-background px-2.5 py-1.5">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            id="vault-search"
            data-testid="vault-search"
            type="search"
            aria-label="Search"
            className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            value={draft}
            onInput={(event) => {
              const text = event.currentTarget.value;
              setDraft(text);
              // Emptied, the tree comes back without waiting for Enter.
              if (!text.trim()) setQuery('');
            }}
            placeholder="Search the vault, then Enter"
          />
        </label>
        <div className="w-44">
          <NativeSelect
            id="vault-project"
            aria-label="Project"
            size="sm"
            className="bg-background dark:bg-background"
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
        <div className="w-44">
          <NativeSelect
            id="vault-type"
            aria-label="Type"
            size="sm"
            className="bg-background dark:bg-background"
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
        {(project || type) && !query && (
          <Muted data-testid="vault-shown" size="xs">
            {shown.length} of {inventory.total} shown
          </Muted>
        )}
      </form>
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r bg-card">
          {query ? (
            <VaultSearchResults
              looks={looks}
              text={query}
              project={project || undefined}
              type={type || undefined}
              selected={selected}
              onSelect={onSelect}
            />
          ) : (
            <VaultTree items={shown} selected={selected} onSelect={onSelect} />
          )}
        </aside>
        <ItemDetails
          selected={selected}
          item={items.find((item) => item.path === selected)}
          looks={looks}
          onSelect={onSelect}
        />
      </div>
    </section>
  );
}
