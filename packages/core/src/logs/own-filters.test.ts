import { expect, test } from 'vitest';
import { ownOf, withOwn } from './own-filters.js';

/** A view's filters, as the app holds them. */
type View = {
  env?: string;
  since?: string;
  filter?: string;
  severity?: string;
  text?: string;
  fields?: Record<string, string>;
  services?: string[];
  trace?: string;
};

test("a query's own filters leave out its env, range and limit; applied, they replace the view's own and keep its env and range", () => {
  const own = ownOf({
    env: 'beta',
    since: '1h',
    limit: 50,
    severity: 'error',
    text: 'berth',
    filter: undefined,
  });
  expect(own).toEqual({ severity: 'error', text: 'berth' });
  const view: View = {
    env: 'prod',
    since: '6h',
    filter: 'labels.app="tide-api"',
    fields: { company: 'Quiet Reef' },
  };
  expect(withOwn(view, own)).toEqual({
    env: 'prod',
    since: '6h',
    severity: 'error',
    text: 'berth',
    filter: undefined,
    fields: undefined,
    services: undefined,
    trace: undefined,
  });
});
