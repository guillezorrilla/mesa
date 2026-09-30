import { expect, test } from 'vitest';
import { parseSessionUri, sessionUri } from './uri.js';

test('generated encoded profile and session path round trip, while bare links stay active-only', () => {
  const profile = "coast!'()* /? #🐚";
  expect(parseSessionUri(sessionUri('aaaaaaaa', profile))).toEqual({ id: 'aaaaaaaa', profile });
  expect(parseSessionUri('mesa://session/%61aaaaaaa')).toEqual({ id: 'aaaaaaaa' });
  expect(parseSessionUri('mesa://session/aaaaaaaa')).toEqual({ id: 'aaaaaaaa' });
});

test.each([
  'mesa://session/unknown',
  'mesa://session/aaaaaaaa/extra',
  'mesa://session/../aaaaaaaa',
  'mesa://session/%2e%2e/aaaaaaaa',
  'mesa://session/%zz',
  'mesa://session/aaaaaaaa#fragment',
  'mesa://session/aaaaaaaa?profile=',
  'mesa://session/aaaaaaaa?profile=%20',
  'mesa://session/aaaaaaaa?profile=%00',
  'mesa://session/aaaaaaaa?profile=coast\nprofile',
  'mesa://session/aaaaaaaa?profile=%ff',
  'mesa://session/aaaaaaaa?profile=%zz',
  'mesa://session/aaaaaaaa?profile=a&profile=b',
  'mesa://session/aaaaaaaa?other=a',
  'mesa://user@session/aaaaaaaa',
  'mesa://session:12/aaaaaaaa',
  'https://session/aaaaaaaa',
  'mesa://clone?url=x',
])('malformed or other session destination refuses without choosing a profile: %s', (uri) => {
  expect(parseSessionUri(uri)).toBeNull();
});
