import { worktreeName } from '@mesa/core/browser';
import { useKept } from '@/lib/keptValue';
import { useCommand } from '@/lib/useCommand';
import type { Card } from './WorktreeCard';

export const WORKTREE_SORTS = ['name', 'size', 'created'] as const;
export type WorktreeSort = (typeof WORKTREE_SORTS)[number];

const isSort = (value: string | undefined): value is WorktreeSort =>
  WORKTREE_SORTS.includes(value as WorktreeSort);

/**
 * How a project's Worktrees cards are ordered, Name by default, kept per profile across visits
 * and restarts.
 */
export function useWorktreeSort() {
  const profile = useCommand('profile.get').data?.profile;
  const [kept, keep] = useKept(profile && `mesa.worktrees.sort.${profile}`);
  const sort: WorktreeSort = isSort(kept) ? kept : 'name';
  const setSort = (next: WorktreeSort) => keep(next);
  return [sort, setSort] as const;
}

/**
 * The cards in `sort` order: by name, the main checkout first and then its worktrees' folders; by
 * size, largest first (one not measured last); or by when they were made, newest first (the main
 * checkout last).
 */
export function sortedCards(cards: readonly Card[], sort: WorktreeSort): Card[] {
  const by: Record<WorktreeSort, (a: Card, b: Card) => number> = {
    name: (a, b) =>
      Number(b.main) - Number(a.main) || worktreeName(a).localeCompare(worktreeName(b)),
    size: (a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1),
    created: (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  };
  return [...cards].sort(by[sort]);
}
