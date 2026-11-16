import { expect, test } from 'vitest';
import { CONFIG_GROUPS, configSetting, readableName } from './config-settings.js';

test('a known key reads as its name, description, topic and default', () => {
  expect(configSetting('autoCompact')).toEqual({
    key: 'autoCompact',
    name: 'Auto-compact',
    description: 'Compacts the conversation when the context window fills.',
    group: 'Model and thinking',
    fallback: 'true',
  });
  expect(configSetting('agentPushNotifEnabled').group).toBe('Notifications');
});

test('a key the table does not know gets a name from the key, in Other, never hidden', () => {
  expect(configSetting('lanternGlowEnabled')).toEqual({
    key: 'lanternGlowEnabled',
    name: 'Lantern glow',
    description: '',
    group: 'Other',
  });
  expect(configSetting('harbour.tide_level').name).toBe('Harbour tide level');
  // An inherited property is not a setting.
  expect(configSetting('constructor').group).toBe('Other');
  expect(CONFIG_GROUPS.at(-1)).toBe('Other');
});

test('values read as words', () => {
  expect(readableName('acceptEdits')).toBe('Accept edits');
  expect(readableName('slack_water')).toBe('Slack water');
  expect(readableName('12h')).toBe('12h');
});
