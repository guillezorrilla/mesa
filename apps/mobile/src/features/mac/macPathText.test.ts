import { expect, test } from 'vitest';
import { macPathText } from './macPathText';

test('a path reads as Direct with its network, or Relay', () => {
  expect(macPathText('lan')).toEqual({ label: 'Direct (LAN)', spoken: 'Direct via LAN' });
  expect(macPathText('tailscale').label).toBe('Direct (Tailscale)');
  expect(macPathText('relay')).toEqual({ label: 'Relay', spoken: "Through Mesa's relay" });
});
