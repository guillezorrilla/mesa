import { expect, test } from 'vitest';
import { paletteView } from './navigation';

test('an Impact hit opens Impact on its project or session; the destination opens it whole', () => {
  const hit = (kind: 'impact' | 'navigation', id: string) =>
    ({ kind, id, label: '', detail: '' }) as Parameters<typeof paletteView>[0];
  expect(paletteView(hit('impact', 'project:lantern-cove'))).toEqual({
    kind: 'impact',
    project: 'lantern-cove',
  });
  expect(paletteView(hit('impact', 'session:a1b2c3d4'))).toEqual({
    kind: 'impact',
    session: 'a1b2c3d4',
  });
  expect(paletteView(hit('navigation', 'impact'))).toEqual({ kind: 'impact' });
});
