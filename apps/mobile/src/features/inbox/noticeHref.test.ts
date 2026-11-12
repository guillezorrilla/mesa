import { expect, test } from 'vitest';
import { noticeHref } from './noticeHref';

const notice = {
  id: 'n1',
  kind: 'input-required',
  at: '',
  title: 't',
  read: false,
  automations: false,
};

test('a notice opens its gate, its session, or Automations; Doctor has no phone screen', () => {
  const session = { id: 'k3m9q2xz', title: 'Login fix' };
  expect(noticeHref({ ...notice, session })).toBe('/agents/k3m9q2xz');
  expect(noticeHref({ ...notice, kind: 'gate', session, gate: 'g1' })).toBe('/agents/gates/g1');
  expect(noticeHref({ ...notice, kind: 'automation', run: 'r1', automations: true })).toBe(
    '/automations',
  );
  expect(noticeHref({ ...notice, kind: 'doctor' })).toBeUndefined();
});
