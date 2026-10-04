import { expect, test } from 'vitest';
import { multiProjectSession, newSession } from '../testing/index.js';
import { sessionProjects } from './session-projects.js';

test('sessionProjects is the primary, then each additional project', () => {
  expect(sessionProjects(newSession())).toEqual(['lantern-cove']);
  expect(sessionProjects(multiProjectSession())).toEqual(['lantern-cove', 'tide-pool']);
});
