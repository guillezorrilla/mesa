import { expect, test } from 'vitest';
import { fieldText } from './jira.js';

test('a Jira field value reads as text, whatever its shape', () => {
  expect(fieldText('Harbor')).toBe('Harbor');
  expect(fieldText(3)).toBe('3');
  expect(fieldText({ value: 'Sev1' })).toBe('Sev1');
  expect(fieldText({ displayName: 'Mira Keel' })).toBe('Mira Keel');
  expect(fieldText([{ name: 'Alarms' }, { name: 'Buoys' }])).toBe('Alarms, Buoys');
  expect(fieldText({ value: 'Harbor', child: { value: 'North pier' } })).toBe(
    'Harbor / North pier',
  );
  const doc = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rang late' }] }],
  };
  expect(fieldText(doc)).toBe('Rang late');
  for (const empty of [null, undefined, '', [], {}]) expect(fieldText(empty)).toBeNull();
});
