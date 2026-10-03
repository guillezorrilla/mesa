import { redactText } from '../lib/redact.js';
import { MesaError } from '../lib/result.js';
import type { Project } from '../projects/project-file.js';
import { decide, type FaroDeps } from './decide.js';
import { DESTRUCTIVE_PATTERNS, firstMatch, SECRET_PATTERNS } from './guardrail-patterns.js';
import { rulesBackend } from './rules.js';
import type { Decision, Question } from './types.js';

/** An external action Mesa is about to take, as the guardrail sees it. */
export type Guarded = {
  /** The mesa command that acts: `send`, `run`; `check` for `mesa guardrail check`. */
  action: string;
  /** What it acts on: a session id for a send; empty for a check. */
  target: string;
  /** The text it would hand on: a prompt. */
  text: string;
  /** The project it acts in, whose `guardrail` level (mesa.yaml) counts; none for a bare check. */
  project?: string;
};

export type GuardrailLevel = Project['guardrail'];
export type Verdict = 'allow' | 'ask' | 'block';

/** What the guardrail answers: its verdict, why in words, and the Decision behind it. */
export type GuardrailCheck = { verdict: Verdict; reason: string; decision: Decision };

/** How an action got past an ask (`--yes`, or a person's yes) or a block (`--force`). */
export type Override = 'yes' | 'confirmed' | 'force';

/** What may let an action past the guardrail. */
export type Overrides = {
  /** Past an ask. */
  yes?: boolean;
  /** Past a block, and an ask. */
  force?: boolean;
  /** Asks a person yes or no; given only where one can answer (a terminal, without --json). */
  confirm?: (question: string) => Promise<boolean>;
};

/** What the rules see: the action, its project's level, and what the text holds. */
type GuardState = Omit<Guarded, 'project'> & {
  project: string | null;
  /** Undefined when the project's mesa.yaml cannot be read. */
  level: GuardrailLevel | undefined;
  /** The secret the text holds, or the destructive command, by name. */
  secret?: string;
  destructive?: string;
};

export type GuardrailDeps = Omit<FaroDeps<GuardState>, 'backends'> & {
  /** A project's `guardrail` level from its mesa.yaml; undefined when that cannot be read. */
  level: (project: string) => GuardrailLevel | undefined;
  /** The profile's key values: a text holding one is blocked like any other secret. */
  secrets: readonly string[];
};

const VERDICT: Question = { kind: 'Choice', id: 'verdict', options: ['allow', 'ask', 'block'] };
const HARMFUL: Question = {
  kind: 'Noul',
  id: 'secret-or-destructive',
  statement: 'This text contains a secret or a destructive instruction',
};

/**
 * The rules, 0.95 sure of every answer: a match, or the project's level, is a fact the rules
 * read, not a guess. They are the guardrail's only backend: no model ever sees a text before it
 * is sent (ADR-0020). The 0.05 left is what the rules cannot see: a text that only mentions a
 * command, and a secret or command no pattern lists. Most of it goes to ask, the verdict between.
 */
const guardRules = rulesBackend<GuardState>(
  [
    {
      when: (s) => Boolean(s.secret ?? s.destructive),
      answer: () => ({ [VERDICT.id]: { allow: 1, ask: 4, block: 95 }, [HARMFUL.id]: 0.95 }),
    },
    {
      when: (s) => s.level !== 'normal',
      answer: () => ({ [VERDICT.id]: { allow: 4, ask: 95, block: 1 }, [HARMFUL.id]: 0.05 }),
    },
  ],
  () => ({ [VERDICT.id]: { allow: 95, ask: 4, block: 1 }, [HARMFUL.id]: 0.05 }),
);

/** Why, in words a person reads: what matched, or the project's level. */
function reasonOf(s: GuardState) {
  if (s.secret) return `the text holds ${s.secret}`;
  if (s.destructive) return `the text holds a destructive command (${s.destructive})`;
  if (s.level === 'strict') return `project ${s.project} has guardrail: strict`;
  if (s.level === undefined) return `project ${s.project}'s guardrail level cannot be read`;
  return 'the text holds no secret and no destructive command';
}

/** The first letter up: a reason as a sentence. */
const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * The guardrail's verdict on an action: one Choice (allow, ask, block) and one Noul (the text
 * holds a secret or a destructive instruction), asked through `decide`, so the Decision goes to
 * `deps.recorder`. Block on a secret (a known shape, or one of the profile's keys) or a
 * destructive command; ask when the project is `guardrail: strict`, or its level cannot be read;
 * allow otherwise.
 */
export async function checkGuardrail(deps: GuardrailDeps, input: Guarded): Promise<GuardrailCheck> {
  const { text, project } = input;
  const secret =
    firstMatch(text, SECRET_PATTERNS) ??
    (redactText(text, deps.secrets) === text ? undefined : "one of the profile's keys");
  const destructive = firstMatch(text, DESTRUCTIVE_PATTERNS);
  const state: GuardState = {
    action: input.action,
    target: input.target,
    text,
    project: project ?? null,
    level: project === undefined ? 'normal' : deps.level(project),
    ...(secret ? { secret } : {}),
    ...(destructive ? { destructive } : {}),
  };
  const decision = await decide({ ...deps, backends: [guardRules] }, state, [VERDICT, HARMFUL]);
  const [answer] = decision.answers;
  const verdict = (answer?.kind === 'Choice' ? answer.answer : 'block') as Verdict;
  return { verdict, reason: reasonOf(state), decision };
}

/**
 * The guardrail in front of an external action: it goes on when allowed, past an ask with `yes`
 * or a person's yes (`confirm`), and past a block, or an ask, with `force`. Otherwise it is
 * guardrail_blocked, with the check as the error's details. Returns the override that let it
 * through, if one did, for the action's receipt.
 */
export async function passGuardrail(
  deps: GuardrailDeps,
  input: Guarded,
  overrides: Overrides,
): Promise<Override | undefined> {
  const check = await checkGuardrail(deps, input);
  const { verdict, reason } = check;
  if (verdict === 'allow') return undefined;
  if (overrides.force) return 'force';
  const blocked = (message: string) => new MesaError('guardrail_blocked', message, check);
  if (verdict === 'block')
    throw blocked(`blocked: ${reason}; pass --force to ${input.action} it anyway`);
  if (overrides.yes) return 'yes';
  if (!overrides.confirm) {
    throw blocked(`the guardrail asks first: ${reason}; pass --yes to ${input.action} it`);
  }
  if (await overrides.confirm(`${sentence(reason)}. ${sentence(input.action)} it?`)) {
    return 'confirmed';
  }
  throw blocked(`declined: ${reason}`);
}
