import { counted, odds } from '../../lib/format.js';
import type { SessionRow } from '../board/rows.js';
import type { SessionRecord, SessionReview } from './record.js';
import { sessionProjects } from './session-projects.js';
import { WAITING_STATES } from './states.js';

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
 * the one its agent gives it, else its goal's first line, else its id.
 */
export const sessionTitle = (
  s: Pick<SessionRecord, 'id' | 'name' | 'review' | 'agentName' | 'goal'> & { managed?: boolean },
) =>
  (s.managed !== false &&
    (s.name ||
      (s.review && reviewLabel(s.review)) ||
      s.agentName ||
      s.goal?.trim().split(/\r?\n/, 1)[0])) ||
  s.id;

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
