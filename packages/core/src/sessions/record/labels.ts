import { counted, firstLine, odds } from '../../lib/format.js';
import type { SessionRow } from '../board/rows.js';
import { projectLabel } from './general.js';
import type { SessionRecord, SessionReview } from './record.js';
import { sessionProjects } from './session-projects.js';
import { type SessionState, WAITING_STATES } from './states.js';

// How Mesa shows a session row and its log to a person, the same in the CLI and on the Board.
// Pure, importing only pure modules, so the app bundles it (`@mesa/core/browser`).

/** A review's title: `Review #12`. */
const reviewTitle = (pr: number) => `Review #${pr}`;

/** A review session's name (mesa prs start): `Review #12`. */
const reviewName = (s: { review?: Pick<SessionReview, 'pr'> }) =>
  s.review ? reviewTitle(s.review.pr) : undefined;

/** What a review session reviews, as its card and the PR's detail say it: `Review #12 · round 2 · drafts`. */
export const reviewLabel = (r: SessionReview) =>
  `${reviewTitle(r.pr)} · round ${r.round} · ${r.mode}`;

/**
 * A session's name when a person gave it one, else a review session's (`Review #12`), else the one
 * its agent gives it, else its id.
 */
export const sessionLabel = (s: {
  id: string;
  name?: string;
  agentName?: string;
  review?: Pick<SessionReview, 'pr'>;
  managed?: boolean;
}) => (s.managed !== false && (s.name || reviewName(s) || s.agentName)) || s.id;

/**
 * What a session's card calls it: its name, else a review session's with its round and mode, else
 * the one its agent gives it, else its goal's first line, else `fallback` (its id).
 */
export const sessionTitle = (
  s: Pick<SessionRecord, 'id' | 'name' | 'review' | 'agentName' | 'goal'> & { managed?: boolean },
  fallback = s.id,
) =>
  (s.managed !== false &&
    (s.name ||
      (s.review && reviewLabel(s.review)) ||
      s.agentName ||
      (s.goal && firstLine(s.goal)))) ||
  fallback;

/** A task's title: its spec's first line. */
export const taskTitle = firstLine;

/**
 * A Setup session (CONTEXT.md, Worktree): the plain terminal Mesa opens beside a session to run
 * worktree setup, named `Setup` or `Setup <project>`, its owner's child.
 */
export const isSetupSession = (s: SessionRow) =>
  s.managed && s.kind === 'terminal' && Boolean(s.parent) && /^Setup( |$)/.test(s.name ?? '');

/** `owner`'s Setup sessions among `rows` (isSetupSession), those that report to it now. */
export const setupSessionsOf = <R extends SessionRow>(rows: readonly R[], owner: string) =>
  rows.filter((s) => isSetupSession(s) && s.managed && s.parentNow === owner);

/** A child as its parent's crew names it: its task's title, else its title (sessionTitle). */
export const crewTitle = (s: SessionRow) => (s.managed && s.taskTitle) || sessionTitle(s);

/**
 * The state a child's row shows: its session's while it works, else what it said it is: an
 * explicit report of `done` or `failed` as that state, `blocked` or an open question as waiting
 * on a person; else its session's.
 */
export const reportedState = (s: SessionRow): SessionState => {
  const state = s.lastState.state;
  if (!s.managed || state === 'working') return state;
  if (s.asking || s.report?.kind === 'blocked') return 'waiting-question';
  if (s.report?.kind === 'done' || s.report?.kind === 'failed') return s.report.kind;
  return state;
};

/**
 * What a child is doing now, in one line: its agent's progress line until it ends, unless a newer
 * report says more; else its newest report's first sentence, else its last reply's first line;
 * none without any.
 */
export const doingNow = (s: SessionRow) => {
  if (!s.managed) return undefined;
  if (s.progress && !s.endedAt && !(s.report && s.report.at > s.progress.at))
    return s.progress.text;
  const report = s.report?.message.trim();
  if (report) return report.split(/(?<=[.!?])\s|\r?\n/, 1)[0];
  return (s.lastReply && firstLine(s.lastReply.text)) || undefined;
};

/** A Mesa session that runs a skill headlessly (CONTEXT.md, Skill run). */
export const isRun = (s: SessionRow) => s.managed && s.kind === 'run';

/**
 * A Mesa session's additional projects as its row names them after its own, `+tide-pool,driftwood`
 * (CONTEXT.md, Additional project); none without.
 */
export const additionalLabel = (s: SessionRow) =>
  s.managed && s.additional ? `+${sessionProjects(s).slice(1).join(',')}` : undefined;

/**
 * The branch a Mesa session works on: the one its agent last named (refreshReadings), else its
 * worktree's, else the one it will once it starts (a queued one's).
 */
export const sessionBranch = (s: SessionRow) =>
  s.managed ? s.gitBranch || s.worktree?.branch || s.pending?.branch : undefined;

/**
 * Where a session runs and on what: its projects, agent, branch and pull request (`#12`), as the
 * Session switcher shows them beside its state.
 */
export const sessionDetail = (s: SessionRow) =>
  [
    [projectLabel(s.project ?? null), additionalLabel(s)].filter(Boolean).join(' '),
    s.agent,
    sessionBranch(s),
    s.managed && s.pr && `#${s.pr.number}`,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * A session Mesa may name (autoName): an interactive one no person, or its agent, has named, and
 * not a review session, whose name is its pull request's (`Review #12`).
 */
export const nameable = (s: {
  kind: string;
  name?: string;
  agentName?: string;
  review?: SessionReview;
}) => s.kind === 'interactive' && !s.name && !s.agentName && !s.review;

/**
 * Which ask for a name a session is at: one for a session named from its item's title, else one
 * per turn, by the time its state was set. autoName asks each once (`nameAsked`).
 */
export const nameAsk = (s: Pick<SessionRecord, 'from' | 'lastState'>) =>
  s.from?.title ? 'title' : s.lastState.at;

/**
 * A Mesa session worth one autoName now: nameable, with a goal or a prompt, not yet asked at this
 * ask (nameAsk), and either started from an item, whose title it is named from at once, or never
 * asked yet, so its first prompt names it while its first turn works, or between turns (idle, or
 * waiting on a person). After the first ask its prompts are read once per turn, never during one:
 * a working session's state time moves with each tool call.
 */
export const wantsName = (s: SessionRow) =>
  s.managed &&
  nameable(s) &&
  s.nameAsked !== nameAsk(s) &&
  Boolean(
    s.from?.title ||
      !s.nameAsked ||
      s.lastState.state === 'idle' ||
      WAITING_STATES.has(s.lastState.state),
  ) &&
  Boolean(s.goal?.trim() || s.conversation);

/** A number of sessions as it reads: `1 session`, `2 sessions`. */
export const sessionCount = (n: number) => counted(n, 'session');

/** Said with every adoption (CONTEXT.md, Adopted session): two agents on one transcript interleave it. */
export const ADOPTION_WARNING =
  'end the session in its original terminal first: both hold the same transcript';

/** What a queued session shows in place of its output. */
export const waitingOn = (after: string | undefined) => `waiting on ${after}`;

/** Why a session may have no output log, as `mesa logs` and the Board's Log say it. */
export const NO_OUTPUT_LOG =
  'it has not started, or config sessions.log was off when it did, or it started before Mesa kept output logs';

/** A session's attention score (0 to 1) as it reads: `0.83`. */
export const attentionScore = (attention: number) => odds(attention);

/** How full a session's context is, as the whole percent shown: 0 to 100 whatever the reading. */
export const contextPercent = (used: number) => Math.round(Math.min(100, Math.max(0, used)));

/** About how many tokens of its window a session's context use holds, as the context panel shows. */
export const contextTokens = (context: { used: number; window: number }) =>
  Math.round((Math.min(context.used, 100) / 100) * context.window);
