import { expect, test } from 'vitest';
import { macLabel } from './macLabel';

test('a Mac goes by the name its link gave, else by its pairing', () => {
  expect(macLabel({ name: 'Studio (work)', pairingId: 'AbCdEfGhIjKlMnOp' })).toBe('Studio (work)');
  expect(macLabel({ pairingId: 'AbCdEfGhIjKlMnOp' })).toBe('Mac AbCd');
});
