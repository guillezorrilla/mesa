import type { SkillInventoryRow } from '@mesa/core';

/** The Skills tab's filters: All is the person's own skills, global and project. */
export const SKILL_TABS = ['all', 'global', 'project', 'plugins', 'mesa'] as const;
export type SkillTab = (typeof SKILL_TABS)[number];

const SCOPES: Record<Exclude<SkillTab, 'all'>, SkillInventoryRow['scope']> = {
  global: 'global',
  project: 'project',
  plugins: 'plugin',
  mesa: 'mesa',
};

/**
 * One card per skill name in each scope: the same skill copied into a Claude and a Codex folder
 * is one skill offered to both. The first copy is the one opened and edited; core still lists
 * the other as a same-name conflict.
 */
export function skillCards(rows: readonly SkillInventoryRow[]): SkillInventoryRow[] {
  const cards = new Map<string, SkillInventoryRow>();
  for (const row of rows) {
    const key = `${row.scope}:${row.name}`;
    const card = cards.get(key);
    if (card) card.providers = [...new Set([...card.providers, ...row.providers])];
    else cards.set(key, { ...row, providers: [...row.providers] });
  }
  return [...cards.values()];
}

/** The cards a tab shows. */
export function inTab(cards: readonly SkillInventoryRow[], tab: SkillTab) {
  return cards.filter((card) =>
    tab === 'all'
      ? card.scope === 'global' || card.scope === 'project'
      : card.scope === SCOPES[tab],
  );
}
