import { expect, test } from 'vitest';
import { reviewPrompt } from './review-prompt.js';

test('a review asks for /code-review on the PR, the reuse axis too, and its scored findings as drafts', () => {
  const prompt = reviewPrompt({ number: 36, mode: 'drafts', rereview: false });
  expect(prompt).toBe(
    [
      'Run /code-review on PR #36.',
      'Besides bugs, look for code the PR could reuse from the codebase, simpler forms, duplication, and modules doing more than one job.',
      'Score each finding 1-10 on how sure you are and how much it matters, and add it as a draft comment with `mesa prs draft 36 --score <1-10> --path <file> --line <n> --text "..."`; Mesa drops any under 7. Add a summary with `mesa prs draft 36 --text "..."`.',
      'Comment only through these commands; never approve or merge.',
    ].join('\n'),
  );
});

test('Post now submits the drafts; a re-review records a verdict on each earlier comment', () => {
  const post = reviewPrompt({ number: 36, mode: 'post', rereview: false });
  expect(post).toContain('Then submit them with `mesa prs publish 36`.');
  expect(reviewPrompt({ number: 36, mode: 'drafts', rereview: false })).not.toContain('publish');

  const again = reviewPrompt({ number: 36, mode: 'drafts', rereview: true });
  expect(again).toContain(
    'This is a re-review: for each of your earlier comments, run `mesa prs verdict 36 --thread <id> --state addressed|partly|not --note "..."`.',
  );
  // The guard stays the last line either way.
  expect(post.split('\n').at(-1)).toBe(
    'Comment only through these commands; never approve or merge.',
  );
});
