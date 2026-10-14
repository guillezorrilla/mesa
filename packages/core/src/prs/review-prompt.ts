import type { SessionReview } from '../sessions/record/record.js';

export type ReviewPromptInput = {
  number: number;
  mode: SessionReview['mode'];
  /** A later round with my earlier threads on the PR, whose verdicts it records. */
  rereview: boolean;
};

/**
 * The goal of a review session, as a person would ask it (#808): run /code-review on the PR, then
 * add what it found as drafts through Mesa, and in post mode submit them. It carries no PR text:
 * the review reads the PR itself. The session's `mesa` is the Mesa that started it, first on its
 * PATH, and knows the project from the session (sessions/window/mesa-shim.ts, prs callerProject).
 */
export function reviewPrompt({ number, mode, rereview }: ReviewPromptInput): string {
  return [
    `Run /code-review on PR #${number}.`,
    `Add each finding as a draft comment with \`mesa prs draft ${number} --path <file> --line <n> --text "..."\`, and a summary with \`mesa prs draft ${number} --text "..."\`.`,
    ...(rereview
      ? [
          `This is a re-review: for each of your earlier comments, run \`mesa prs verdict ${number} --thread <id> --state addressed|partly|not --note "..."\`.`,
        ]
      : []),
    ...(mode === 'post' ? [`Then submit them with \`mesa prs publish ${number}\`.`] : []),
    'Comment only through these commands; never approve or merge.',
  ].join('\n');
}
