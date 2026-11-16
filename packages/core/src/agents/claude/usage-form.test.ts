import { expect, test } from 'vitest';
import { parseUsageForm } from './usage-form.js';

test('reads switches, choices and free values in the order the agent lists them', () => {
  const output = [
    'Usage: /config key=value [key=value ...]',
    '  lanternGlow=true|false',
    '  tide=low|high|slack water',
    '  harbourName=<value>',
    '  dock=true|false|default',
  ].join('\n');
  expect(parseUsageForm(output)).toEqual({
    command: '/config',
    fields: [
      { key: 'lanternGlow', kind: 'boolean' },
      { key: 'tide', kind: 'choice', choices: ['low', 'high', 'slack water'] },
      { key: 'harbourName', kind: 'text' },
      { key: 'dock', kind: 'choice', choices: ['true', 'false', 'default'] },
    ],
  });
});

test('any built-in with the same usage shape is a form', () => {
  expect(parseUsageForm('Usage: /moorings key=value\n  berth=one|two')).toEqual({
    command: '/moorings',
    fields: [{ key: 'berth', kind: 'choice', choices: ['one', 'two'] }],
  });
});

test('a line of another shape is left out, the rest kept', () => {
  const output = 'Usage: /config key=value\n  buoys: four\n  (more soon)\n  beacon=true|false';
  expect(parseUsageForm(output)?.fields).toEqual([{ key: 'beacon', kind: 'boolean' }]);
});

test('no form for an empty list or for other text', () => {
  expect(parseUsageForm('Usage: /config key=value [key=value ...]\n')).toBeUndefined();
  expect(
    parseUsageForm("tidal isn't a /config setting. Run /config to see what's available."),
  ).toBeUndefined();
  expect(parseUsageForm('Usage: /model <name>. Available: sonnet, opus')).toBeUndefined();
  expect(parseUsageForm('')).toBeUndefined();
});
