import { expect, test } from 'vitest';
import { groupErrors } from './errors.js';
import type { CloudLogEntry } from './gcp.js';
import { normalizedMessage } from './normalize.js';
import { groupTerms, plainTitle } from './occurrences.js';

let n = 0;
const entry = (message: string): CloudLogEntry => ({
  project: 'tide-tables-123',
  id: `e${n++}`,
  time: new Date(Date.parse('2026-05-06T07:00:00Z') + n * 1000).toISOString(),
  severity: 'ERROR',
  service: 'tide-api',
  message,
  trace: null,
  fields: {},
});

/** Invented messages of the shapes real errors take: ids, dates, quoted values and JSON. */
const IDS = [
  'Failed to retrieve customer: AQWRR4Kx9pLmZ2 Error with status code 401',
  'Failed to retrieve customer: BZTT7Qy1rNnW8c Error with status code 401',
  'Failed to retrieve customer: CC93hhP0aQqR4t Error with status code 403',
  'Failed to retrieve customer: 6f1c2d3e-9a8b-4c7d-8e6f-5a4b3c2d1e0f Error with status code 401',
  'Failed to retrieve customer: 2026-05-06T07:12:44.120Z Error with status code 401',
  'Failed to retrieve customer: "EE81kk20Lm" Error with status code 401',
];
const JSONS = Array.from({ length: 6 }, (_, i) =>
  JSON.stringify({
    action: 'findCustomerByCustomerId',
    created: `2026-05-06T07:0${i}:00Z`,
    customerId: `cus_${1000 + i}AbCdEf`,
    requestId: `9f2c4e${i}a`,
    message: `Customer ${1000 + i} not found`,
  }),
);

test('ids, uuids, dates and quoted values vary; paths and words stay', () => {
  expect(normalizedMessage('GET /tides/LC-04 502 1840ms at 2026-05-06T07:12:44Z')).toBe(
    'GET /tides/LC-# # #ms at #',
  );
  expect(normalizedMessage('user \'alice\' failed with "code red"')).toBe('user # failed with #');
});

test('six messages of one failure, ids and dates aside, make one group of 6; six JSON messages another, titled by their action', () => {
  const groups = groupErrors('tide-tables-123', [...IDS, ...JSONS].map(entry));
  expect(groups.map((g) => g.count)).toEqual([6, 6]);
  const json = groups.find((g) => g.id.startsWith('json:'));
  // The newest of them names it (entries come newest first).
  expect(json?.message).toBe('findCustomerByCustomerId: Customer 1000 not found');
  expect(plainTitle(JSONS[0] as string)).toBe('findCustomerByCustomerId: Customer 1000 not found');
});

test("every group's terms are held by each of its messages, so its occurrence query finds them all", () => {
  const messages = [
    ...IDS,
    ...JSONS,
    'GET /checkout 502 1840ms request_id=9f2c4e6a',
    'GET /checkout 502 1702ms request_id=11ab77c0',
  ];
  const entries = messages.map(entry);
  for (const group of groupErrors('tide-tables-123', entries)) {
    const terms = groupTerms(group.sample || group.message);
    expect(terms.length).toBeGreaterThan(0);
    const members = entries.filter((e) => groupErrors('p', [e])[0]?.id === group.id);
    expect(members).toHaveLength(group.count);
    for (const member of members) for (const term of terms) expect(member.message).toContain(term);
  }
});
