import { expect, test } from 'vitest';
import { clauseState, fieldClause, paneClauses, withClause, withoutClause } from './explorerQuery';
import { shortValue } from './fieldText';

test('the chips are the clauses the fields pane wrote; removing one takes its line out of the query', () => {
  const company = fieldClause('company', 'Lantern "Cove"');
  let query = withClause('"lookup failed"', company);
  query = withClause(query, 'severity=DEBUG', true);
  query = withClause(
    query,
    '(resource.labels.container_name="tide-api" OR resource.labels.service_name="tide-api")',
  );
  expect(paneClauses(query).map((c) => [c.label, c.exclude])).toEqual([
    ['company = Lantern "Cove"', false],
    ['not severity DEBUG', true],
    ['service tide-api', false],
  ]);
  expect(clauseState(query, company)).toBe('in');
  expect(clauseState(query, 'severity=DEBUG')).toBe('out');
  expect(clauseState(query, 'severity=INFO')).toBeUndefined();
  expect(withoutClause(query, 'severity=DEBUG')).toBe(
    `"lookup failed"\nAND ${company}\nAND (resource.labels.container_name="tide-api" OR resource.labels.service_name="tide-api")`,
  );
  expect(withoutClause(company, company)).toBe('');
});

test('a long value keeps what identifies it: a logger its class, a service its suffix, an id both ends', () => {
  expect(shortValue('com.tides.harbour.webhook.domain.TideWebhookService', 36)).toBe(
    '\u{2026}webhook.domain.TideWebhookService',
  );
  expect(shortValue('harbour-web-frontend-europe-beta', 14, 'service')).toBe(
    '\u{2026}d-europe-beta',
  );
  expect(shortValue('9f8e7d6c5b4a39281706f5e4d3c2b1a0', 11)).toBe('9f8e7\u{2026}2b1a0');
  expect(shortValue('short', 11)).toBe('short');
});
