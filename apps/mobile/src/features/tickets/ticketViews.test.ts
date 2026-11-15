import { expect, test } from 'vitest';
import { inView, viewChoices } from './ticketViews';

const ticket = (key: string, views?: string[]) => ({
  id: key,
  key,
  summary: key,
  status: 'To Do',
  category: 'new',
  mine: false,
  url: '',
  sessions: [],
  ...(views ? { views } : {}),
});
const views = [{ name: 'sprint' }, { name: 'triage' }];
const tickets = [ticket('A', ['sprint']), ticket('B', ['sprint', 'triage'])];

test('several views give All and one counted chip each; one view, or an older Mac, gives none', () => {
  expect(viewChoices(views, tickets)).toEqual([
    { value: '', label: 'All', count: 2 },
    { value: 'sprint', label: 'sprint', count: 2 },
    { value: 'triage', label: 'triage', count: 1 },
  ]);
  expect(viewChoices([views[0]], tickets)).toEqual([]);
  expect(viewChoices(views, [ticket('A')])).toEqual([]);
});

test('a picked view keeps its tickets; All keeps every one', () => {
  expect(inView(tickets, 'triage').map((t) => t.key)).toEqual(['B']);
  expect(inView(tickets, '')).toHaveLength(2);
});
