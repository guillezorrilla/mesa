import type { SessionReview } from '../sessions/record/record.js';
import { DRAFT_BAR } from './reader.js';

export type ReviewPromptInput = {
  number: number;
  mode: SessionReview['mode'];
  /** A later round with my earlier threads on the PR, whose verdicts it records. */
  rereview: boolean;
  /** The person's Review voice, their own text, when the profile has one. */
  voice?: string | null;
};

/**
 * The goal of a review session, as a person would ask it (#808): run /code-review on the PR, then
 * add what it found as drafts through Mesa, and in post mode submit them. It carries no PR text:
 * the review reads the PR itself. Mesa adds what any project's /code-review may miss: the reuse
 * and simplicity axis, and a score per finding that `mesa prs draft` holds to DRAFT_BAR. The
 * session's `mesa` is the Mesa that started it, first on its
 * PATH, and knows the project from the session (sessions/window/mesa-shim.ts, prs callerProject).
 */
export function reviewPrompt({ number, mode, rereview, voice }: ReviewPromptInput): string {
  return [
    `Run /code-review on PR #${number}.`,
    'Besides bugs, look for code the PR could reuse from the codebase, simpler forms, duplication, and modules doing more than one job.',
    `Score each finding 1-10 on how sure you are and how much it matters, and add it as a draft comment with \`mesa prs draft ${number} --score <1-10> --path <file> --line <n> --text "..."\`; Mesa drops any under ${DRAFT_BAR}. Add a summary with \`mesa prs draft ${number} --text "..."\`.`,
    ...(voice ? ['Write every comment in my voice, as described here:', voice] : []),
    ...(rereview
      ? [
          `This is a re-review: for each of your earlier comments, run \`mesa prs verdict ${number} --thread <id> --state addressed|partly|not --note "..."\`.`,
        ]
      : []),
    ...(mode === 'post' ? [`Then submit them with \`mesa prs publish ${number}\`.`] : []),
    'Comment only through these commands; never approve or merge.',
  ].join('\n');
}
