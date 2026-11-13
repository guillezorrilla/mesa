import { expect, test } from 'vitest';
import { assigneesText, noTicketsText, ticketDetail, ticketTitle } from './ticketText';

const ticket = {
  id: 'jira:HAR-219',
  key: 'HAR-219',
  summary: 'Berth schedule export',
  status: 'To Do',
  category: 'new',
  mine: false,
  url: 'https://harbour.example/browse/HAR-219',
  sessions: [],
};

test("a ticket's line says its status, whose it is, and its live sessions", () => {
  expect(ticketDetail(ticket)).toBe('To Do · Unassigned');
  expect(ticketDetail({ ...ticket, assignee: 'Ada', sessions: ['a1'] })).toBe(
    'To Do · Ada · 1 live session',
  );
  expect(ticketDetail({ ...ticket, mine: true, assignee: 'Grace', sessions: ['a1', 'b2'] })).toBe(
    'To Do · Yours · 2 live sessions',
  );
});

test('the panel names its assignees, the title leads with the key, and an empty list says why', () => {
  expect(assigneesText({ assignees: [], mine: false })).toBe('Unassigned');
  expect(assigneesText({ assignees: ['Ada', 'Grace'], mine: true })).toBe('Ada, Grace (you)');
  expect(ticketTitle(ticket)).toBe('HAR-219: Berth schedule export');
  expect(noTicketsText(0)).toBe(
    'This project follows no ticket views. Follow one in Mesa on your Mac.',
  );
  expect(noTicketsText(2)).toBe('No tickets in the views this project follows.');
});
