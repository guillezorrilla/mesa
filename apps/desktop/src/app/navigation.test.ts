import { expect, test } from 'vitest';
import { paletteView } from './navigation';

test('an Impact hit opens Impact on its project or session; the destination opens it whole', () => {
  const hit = (fields: object) =>
    ({ label: '', detail: '', ...fields }) as Parameters<typeof paletteView>[0];
  expect(
    paletteView(hit({ kind: 'impact', id: 'project:lantern-cove', project: 'lantern-cove' })),
  ).toEqual({ kind: 'impact', project: 'lantern-cove' });
  expect(paletteView(hit({ kind: 'impact', id: 'session:a1b2c3d4', session: 'a1b2c3d4' }))).toEqual(
    { kind: 'impact', session: 'a1b2c3d4' },
  );
  expect(paletteView(hit({ kind: 'navigation', id: 'impact' }))).toEqual({ kind: 'impact' });
});
