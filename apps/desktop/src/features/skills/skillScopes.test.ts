import type { SkillInventoryRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { inTab, skillCards } from './skillScopes';

const row = (
  name: string,
  scope: SkillInventoryRow['scope'],
  providers: SkillInventoryRow['providers'],
  path = `/h/${scope}/${name}`,
): SkillInventoryRow => ({
  id: path,
  name,
  description: '',
  source: scope === 'project' ? 'repo' : scope,
  scope,
  path,
  providers,
  enabled: true,
  supportFiles: [],
  writable: true,
  conflicts: [],
  disabledFor: [],
  precedence: 'only-discovered-source',
});

test('a skill copied into two provider folders is one card offered to both', () => {
  const cards = skillCards([
    row('tide-chart', 'global', ['claude'], '/h/.claude/skills/tide-chart'),
    row('tide-chart', 'global', ['codex'], '/h/.agents/skills/tide-chart'),
    row('tide-chart', 'project', ['claude']),
  ]);
  expect(cards.map((card) => [card.scope, card.path, card.providers])).toEqual([
    ['global', '/h/.claude/skills/tide-chart', ['claude', 'codex']],
    ['project', '/h/project/tide-chart', ['claude']],
  ]);
});

test('All holds global and project skills; plugins and Mesa skills have their own tabs', () => {
  const cards = skillCards([
    row('tide-chart', 'global', ['claude']),
    row('sunset-map', 'project', ['claude']),
    row('harbour-map', 'plugin', ['claude']),
    row('session-summary', 'mesa', ['claude']),
  ]);
  const names = (tab: Parameters<typeof inTab>[1]) => inTab(cards, tab).map((card) => card.name);
  expect(names('all')).toEqual(['tide-chart', 'sunset-map']);
  expect(names('global')).toEqual(['tide-chart']);
  expect(names('plugins')).toEqual(['harbour-map']);
  expect(names('mesa')).toEqual(['session-summary']);
});
