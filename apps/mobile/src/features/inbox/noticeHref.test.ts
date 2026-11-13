import { expect, test } from 'vitest';
import { noticeHref } from './noticeHref';

const notice = {
  id: 'n1',
  kind: 'input-required',
  at: '',
  title: 't',
  read: false,
};

test('a notice opens its gate or its session; Doctor and automations stay on the Mac', () => {
  const session = { id: 'k3m9q2xz', title: 'Login fix' };
  expect(noticeHref({ ...notice, session })).toBe('/agents/k3m9q2xz');
  expect(noticeHref({ ...notice, kind: 'gate', session, gate: 'g1' })).toBe('/agents/gates/g1');
  expect(noticeHref({ ...notice, kind: 'automation' })).toBeUndefined();
  expect(noticeHref({ ...notice, kind: 'doctor' })).toBeUndefined();
});
