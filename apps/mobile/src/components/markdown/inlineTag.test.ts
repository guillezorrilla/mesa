import { expect, test } from 'vitest';
import { inlineTag } from './inlineTag';

test('inline tags read as the span tokens they stand for', () => {
  expect(inlineTag('<strong>')).toMatchObject({ type: 'strong_open' });
  expect(inlineTag('</EM>')).toMatchObject({ type: 'em_close' });
  expect(inlineTag('<a href="https://a.example">')).toMatchObject({
    type: 'link_open',
    href: 'https://a.example',
  });
  expect(inlineTag('<br />')).toMatchObject({ type: 'text', content: '\n' });
  expect(inlineTag('<img alt="logo" src="x">')).toMatchObject({ type: 'text', content: 'logo' });
  expect(inlineTag('<sup>')).toMatchObject({ type: 'text', content: '' });
  expect(inlineTag('<script>')).toMatchObject({ type: 'text', content: '<script>' });
  expect(inlineTag('<!-- x -->')).toMatchObject({ type: 'text', content: '' });
});
