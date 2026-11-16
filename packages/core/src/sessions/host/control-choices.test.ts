import { expect, test } from 'vitest';
import { agentModes, codexPreset, controlChoices } from './control-choices.js';

test("Claude's pickers: its four models by name, the rest under More, efforts and modes as Desktop names them", () => {
  const choices = controlChoices({
    agent: 'claude',
    models: ['opus', 'sonnet', 'haiku', 'fable'],
    efforts: ['low', 'xhigh'],
    modes: agentModes('claude', 'manual'),
  });
  expect(choices.models.map((m) => m.label)).toEqual([
    'Opus 5.5',
    'Fable 5.2',
    'Sonnet 5.5',
    'Haiku 5.5',
  ]);
  expect(choices.more.map((m) => m.id)).toEqual(['opus[1m]', 'sonnet[1m]', 'best', 'opusplan']);
  expect(choices.efforts.map((e) => e.label)).toEqual(['Low', 'Extra']);
  expect(choices.modes.map((m) => m.label)).toEqual(['Auto', 'Manual', 'Accept edits', 'Plan']);
  expect(agentModes('claude', 'bypassPermissions')).toContain('bypassPermissions');
});

test("Codex's pickers: its models by the names it lists, four first, and its approval presets", () => {
  const choices = controlChoices({
    agent: 'codex',
    models: ['m1', 'm2', 'm3', 'm4', 'm5'],
    modelLabels: { m1: 'Model One' },
    efforts: ['minimal'],
    modes: agentModes('codex', 'read-only'),
  });
  expect(choices.models.map((m) => m.label)).toEqual(['Model One', 'm2', 'm3', 'm4']);
  expect(choices.more.map((m) => m.id)).toEqual(['m5']);
  expect(choices.modes.map((m) => m.id)).toEqual(['read-only', 'auto']);
  expect(codexPreset('never', 'dangerFullAccess')).toBe('full-access');
  expect(codexPreset('untrusted', 'readOnly')).toBeUndefined();
});
