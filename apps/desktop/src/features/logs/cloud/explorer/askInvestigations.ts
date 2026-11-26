import type { CloudLogEntry } from '@mesa/core';
import type { CloudFilters } from '@/lib/client/logs';

/** A quick investigation the Claude panel offers: a question, the filters it reads with, why it is off. */
export type Investigation = {
  label: string;
  question: string;
  over?: CloudFilters;
  /** Why it cannot run now; it can when unset. */
  off?: string;
};

/** Field names that say who an entry is about: a company, user, customer, account or tenant. */
const WHO = /^(?:company|user|customer|account|tenant|merchant)/i;

/**
 * The Claude panel's quick investigations (CONTEXT.md, Ask (logs)): a 5xx spike since the last
 * deploy, the errors of the company or user the selected `entry` names (its field as a filter, so
 * its value reaches the model masked like every filter), and what is new since yesterday.
 */
export function askInvestigations(filters: CloudFilters, entry?: CloudLogEntry): Investigation[] {
  const who = entry && Object.entries(entry.fields).find(([key, value]) => WHO.test(key) && value);
  return [
    {
      label: '5xx spike since the last deploy',
      question:
        'Is there a 5xx spike since the last deploy? Say which service and deploy it follows, how big it is against before, and what the errors say.',
    },
    who
      ? {
          label: `Errors for this ${who[0]}`,
          question: `What errors did the ${who[0]} in the field filter hit in this range, and why?`,
          over: { severity: 'error', fields: { ...filters.fields, [who[0]]: who[1] } },
        }
      : {
          label: 'Errors for this company/user',
          question: '',
          off: 'Select an entry with a company or user field',
        },
    {
      label: 'What is new since yesterday',
      question:
        'What is new since yesterday: the error groups that are New or Back again, when each started, and whether a deploy came just before it.',
      over: { since: '1d' },
    },
  ];
}
