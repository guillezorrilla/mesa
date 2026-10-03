import type { SkillInventoryRow } from '@mesa/core';
import {
  FileText,
  FolderGit2,
  Globe,
  type LucideIcon,
  Package,
  Puzzle,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SCOPE_ICONS: Record<SkillInventoryRow['scope'], LucideIcon> = {
  global: Globe,
  project: FolderGit2,
  plugin: Puzzle,
  mesa: Package,
};

/** What stops or switches a skill, when anything does; a plain available skill says nothing. */
export function skillStatus(row: SkillInventoryRow) {
  if (row.invalidReason) return 'Invalid';
  if (row.source === 'mesa') return row.enabled ? 'Enabled' : 'Off';
  return row.enabled ? undefined : 'Disabled';
}

/** A small tinted label: a skill's scope, file count, state or conflict. */
export function SkillChip(props: {
  icon?: LucideIcon;
  tone: 'scope' | 'files' | 'muted' | 'attention';
  children: React.ReactNode;
}) {
  const Icon = props.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
        props.tone === 'scope' && 'bg-state-working/10 text-state-working',
        props.tone === 'files' && 'bg-[var(--series-7)]/10 text-[var(--series-7)]',
        props.tone === 'muted' && 'bg-muted text-muted-foreground',
        props.tone === 'attention' && 'bg-state-waiting/10 text-state-waiting',
      )}
    >
      {Icon && <Icon aria-hidden className="size-3" />}
      {props.children}
    </span>
  );
}

/** The chips under a skill's name, in the list and on its page. */
export function SkillChips({ row }: { row: SkillInventoryRow }) {
  const status = skillStatus(row);
  const files = row.supportFiles.length + 1;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <SkillChip icon={SCOPE_ICONS[row.scope]} tone="scope">
        {row.scope}
      </SkillChip>
      {files > 1 && (
        <SkillChip icon={FileText} tone="files">
          {files} files
        </SkillChip>
      )}
      {status && <SkillChip tone="muted">{status}</SkillChip>}
      {row.conflicts.length > 0 && <SkillChip tone="attention">Conflict</SkillChip>}
      <span className="text-xs text-muted-foreground">{row.providers.join(', ')}</span>
    </div>
  );
}

/** The skill's mark: the same tile on its card and its page. */
export function SkillMark() {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-[var(--series-7)]">
      <Sparkles aria-hidden className="size-4" />
    </span>
  );
}

/** One skill in the list: its mark, name, description and chips; it opens the skill's page. */
export function SkillCard(props: { row: SkillInventoryRow; onOpen: () => void }) {
  const { row } = props;
  return (
    <button
      type="button"
      className="flex gap-3 rounded-lg border bg-card/40 p-4 text-left transition-colors hover:border-ring/60 hover:bg-card focus-visible:outline-2 focus-visible:outline-ring"
      onClick={props.onOpen}
    >
      <SkillMark />
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="block truncate font-medium">{row.name}</span>
        <span className="line-clamp-2 text-sm text-muted-foreground">
          {row.description || row.path}
        </span>
        <SkillChips row={row} />
      </span>
    </button>
  );
}
