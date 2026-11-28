import { expect, test } from 'vitest';
import { askInvestigations } from './askInvestigations';

const entry = (fields: Record<string, string>) => ({
  project: 'tide-tables-123',
  id: 'aa11',
  time: '2026-05-06T07:09:00Z',
  severity: 'ERROR',
  service: 'tide-api',
  message: 'berth lookup failed',
  trace: null,
  fields,
});

test("the company or user investigation filters by the selected entry's field, its value never in the question", () => {
  const [, who] = askInvestigations(
    { fields: { env: 'beta' } },
    entry({ companyId: 'c-77', uri: '/docks' }),
  );
  expect(who).toMatchObject({
    label: 'Errors for this companyId',
    question: 'What errors did the companyId in the field filter hit in this range, and why?',
    over: { severity: 'error', fields: { env: 'beta', companyId: 'c-77' } },
  });
  expect(askInvestigations({}, entry({ uri: '/docks' }))[1]?.off).toBe(
    'Select an entry with a company or user field',
  );
  expect(askInvestigations({})[2]?.over).toEqual({ since: '1d' });
});
