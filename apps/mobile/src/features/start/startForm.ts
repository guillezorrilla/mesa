import { AGENT_LABELS, type Place, type StartCall, type StartResult } from '@mesa/core/phone';

// The start form's pure rules: what a choice means, what the launch line says, and the call it
// becomes. `agent` and `after` use 'default' and 'none' for no choice, so the chips can name them.

export type StartForm = {
  project?: string;
  agent: string;
  place: Place;
  /** With a new worktree: its branch; blank lets Mesa name one. */
  branch: string;
  /** With an existing worktree: its path. */
  checkout?: string;
  after: string;
};

export const NEW_FORM: StartForm = {
  agent: 'default',
  place: 'checkout',
  branch: '',
  after: 'none',
};

export const AGENT_CHOICES = [
  ['default', "Project's"],
  ...Object.entries(AGENT_LABELS),
] as const satisfies readonly (readonly [string, string])[];

export const PLACE_CHOICES = [
  ['checkout', 'Checkout'],
  ['worktree', 'New worktree'],
  ['existing', 'Existing worktree'],
] as const satisfies readonly (readonly [Place, string])[];

const agentName = (agent: string) =>
  agent === 'default'
    ? "the project's agent"
    : (AGENT_LABELS[agent as keyof typeof AGENT_LABELS] ?? agent);

/** The last part of a path, as a worktree is named. */
const folder = (path: string) => path.slice(path.lastIndexOf('/') + 1);

function placeWords(form: StartForm) {
  if (form.place === 'worktree')
    return form.branch.trim() ? `a worktree on ${form.branch.trim()}` : 'a new worktree';
  if (form.place === 'existing')
    return form.checkout ? `worktree ${folder(form.checkout)}` : 'a worktree you pick';
  return 'the checkout';
}

/**
 * The start in one line, as the bar and the confirmation say it: Claude Code on lantern-cove,
 * in a new worktree, after Login fix. `afterTitle` names the session it waits for.
 */
export function launchLine(form: StartForm, afterTitle?: string) {
  const on = form.project ? ` on ${form.project}` : '';
  const after = form.after !== 'none' ? `, after ${afterTitle ?? form.after}` : '';
  const line = `${agentName(form.agent)}${on}, in ${placeWords(form)}${after}`;
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** Whether the form can start: a project, a goal or a ticket, and a worktree when it asks for one. */
export const canStart = (form: StartForm, goal: string, from?: string) =>
  Boolean(form.project) &&
  Boolean(goal.trim() || from) &&
  (form.place !== 'existing' || Boolean(form.checkout));

/** The `start` call the form makes, with only the choices its place uses. */
export function startCall(form: StartForm, goal: string, from?: string, yes = false): StartCall {
  return {
    method: 'start',
    project: form.project ?? '',
    goal: goal.trim(),
    place: form.place,
    ...(form.agent !== 'default' ? { agent: form.agent } : {}),
    ...(form.place === 'worktree' && form.branch.trim() ? { branch: form.branch.trim() } : {}),
    ...(form.place === 'existing' && form.checkout ? { checkout: form.checkout } : {}),
    ...(form.after !== 'none' ? { after: form.after } : {}),
    ...(from ? { from } : {}),
    ...(yes ? { yes } : {}),
  };
}

/** Why the guardrail stopped a start; none once started. */
export function startNoteText({ status, reason }: StartResult): string | undefined {
  const why = reason ?? 'no reason given';
  if (status === 'ask') return `The guardrail asks first: ${why}.`;
  if (status === 'blocked') return `The guardrail blocked it: ${why}. Nothing was started.`;
  return undefined;
}
