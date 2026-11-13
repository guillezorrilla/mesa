import { expect, test } from 'vitest';
import { canStart, launchLine, NEW_FORM, sameStart, startCall, startNoteText } from './startForm';

const form = { ...NEW_FORM, project: 'lantern-cove' };

test('the launch line names the agent, the project, the place and what it waits for', () => {
  expect(launchLine(form)).toBe("The project's agent on lantern-cove, in the checkout");
  expect(launchLine({ ...form, agent: 'codex', place: 'worktree' })).toBe(
    'Codex on lantern-cove, in a new worktree',
  );
  expect(
    launchLine({
      ...form,
      agent: 'claude',
      place: 'worktree',
      branch: ' tide-fix ',
      after: 'a1b2',
      afterTitle: 'Login fix',
    }),
  ).toBe('Claude Code on lantern-cove, in a worktree on tide-fix, after Login fix');
  expect(launchLine({ ...form, place: 'existing', checkout: '/w/lantern-cove-tide' })).toBe(
    "The project's agent on lantern-cove, in worktree lantern-cove-tide",
  );
});

test('a start needs a project, a goal or a ticket, and the worktree it picked', () => {
  expect(canStart(NEW_FORM, 'Chart the tides')).toBe(false);
  expect(canStart(form, '  ')).toBe(false);
  expect(canStart(form, '', 'jira:HAR-219')).toBe(true);
  expect(canStart({ ...form, place: 'existing' }, 'Chart the tides')).toBe(false);
  expect(canStart({ ...form, place: 'existing', checkout: '/w/a' }, 'Chart the tides')).toBe(true);
});

test('the call carries only what its place uses, and the person past an ask', () => {
  expect(startCall({ ...form, branch: 'left over', checkout: '/w/a' }, ' Chart ')).toEqual({
    method: 'start',
    project: 'lantern-cove',
    goal: 'Chart',
    place: 'checkout',
  });
  expect(
    startCall(
      { ...form, agent: 'codex', place: 'worktree', branch: 'tide', after: 'a1b2' },
      '',
      'jira:HAR-219',
      true,
    ),
  ).toEqual({
    method: 'start',
    project: 'lantern-cove',
    goal: '',
    place: 'worktree',
    agent: 'codex',
    branch: 'tide',
    after: 'a1b2',
    from: 'jira:HAR-219',
    yes: true,
  });
});

test("the guardrail's ask and block are said with their reason, and nothing once started", () => {
  expect(
    startNoteText({ status: 'ask', reason: 'project lantern-cove has guardrail: strict' }),
  ).toBe('The guardrail asks first: project lantern-cove has guardrail: strict.');
  expect(startNoteText({ status: 'blocked', reason: 'a destructive command' })).toBe(
    'The guardrail blocked it: a destructive command. Nothing was started.',
  );
  expect(startNoteText({ status: 'started', session: 'a1b2' })).toBeUndefined();
});

test('a guardrail note holds only while the start it was given on is unchanged', () => {
  const asked = startCall(form, 'Chart the tides');
  expect(sameStart(asked, startCall(form, 'Chart the tides', undefined, true))).toBe(true);
  expect(sameStart(asked, startCall(form, 'Chart the tides and push'))).toBe(false);
  expect(sameStart(asked, startCall({ ...form, place: 'worktree' }, 'Chart the tides'))).toBe(
    false,
  );
});
