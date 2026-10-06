import { expect, test } from 'vitest';
import { brokerUrl, DEFAULT_BROKER_URL } from './broker.js';

test('the broker URL drops trailing slashes and defaults to the hosted broker', () => {
  expect(brokerUrl({ MESA_BROKER_URL: 'https://broker.example///' })).toBe(
    'https://broker.example',
  );
  expect(brokerUrl({ MESA_BROKER_URL: 'https://broker.example' })).toBe('https://broker.example');
  expect(brokerUrl({ MESA_BROKER_URL: '///' })).toBe('');
  expect(brokerUrl({})).toBe(DEFAULT_BROKER_URL);
});
