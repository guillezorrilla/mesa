import { readFileSync } from 'node:fs';
import { beforeEach, expect, test } from 'vitest';
import { lockDeps, tempDir, thrown } from '../testing/index.js';
import { loadConfig, setConfigValue } from './config.js';
import { profilePaths } from './paths.js';
import { initProfile } from './profile.js';
import {
  TERMINAL_COLOR,
  TERMINAL_COLOR_KEYS,
  TERMINAL_PRESET_IDS,
  TERMINAL_PRESETS,
  terminalPalette,
} from './terminal-palettes.js';

let file: string;
beforeEach(() => {
  const paths = profilePaths(tempDir(), 'default');
  initProfile(paths, { vault: '/tmp/v' });
  file = paths.config;
});

const { 'mesa-dark': mesaDark, 'mesa-light': mesaLight, dracula } = TERMINAL_PRESETS;

test('the 12 presets each carry all 20 colors as #rrggbb', () => {
  expect(TERMINAL_PRESET_IDS).toHaveLength(12);
  for (const id of TERMINAL_PRESET_IDS) {
    const colors = TERMINAL_PRESETS[id].colors;
    expect(Object.keys(colors)).toEqual([...TERMINAL_COLOR_KEYS]);
    for (const color of Object.values(colors)) expect(color).toMatch(TERMINAL_COLOR);
  }
});

test('follow takes the interface theme, a preset and its alias are fixed, custom is its own', () => {
  expect(terminalPalette({ theme: 'follow' }, true)).toEqual(mesaDark.colors);
  expect(terminalPalette({ theme: 'follow' }, false)).toEqual(mesaLight.colors);
  expect(terminalPalette({ theme: 'dracula' }, false)).toEqual(dracula.colors);
  expect(terminalPalette({ theme: 'dark' }, false)).toEqual(mesaDark.colors);
  expect(terminalPalette({ theme: 'light' }, true)).toEqual(mesaLight.colors);
  const colors = { ...dracula.colors, red: '#123456' };
  expect(terminalPalette({ theme: 'custom', colors }, true)).toEqual(colors);
});

test('config takes a preset, and custom only with all 20 valid colors', () => {
  expect(setConfigValue(file, 'terminal.theme', 'dracula', lockDeps()).value).toBe('dracula');
  const before = readFileSync(file, 'utf8');
  for (const [path, value, named] of [
    ['terminal.theme', 'custom', 'terminal.colors'],
    ['terminal.theme', 'nord', 'terminal.theme'],
    ['terminal.colors.red', 'red', 'terminal.colors.red'],
    ['terminal.colors.purple', '"#ff00ff"', 'terminal.colors'],
  ] as const) {
    const error = thrown(() => setConfigValue(file, path, value, lockDeps()));
    expect(error.code).toBe('invalid_config');
    expect(error.message).toContain(`${named}:`);
    expect(readFileSync(file, 'utf8')).toBe(before);
  }
  setConfigValue(file, 'terminal.colors', JSON.stringify(mesaDark.colors), lockDeps());
  expect(setConfigValue(file, 'terminal.theme', 'custom', lockDeps()).value).toBe('custom');
  expect(loadConfig(file).terminal.colors).toEqual(mesaDark.colors);
});
