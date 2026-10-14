import { runText } from '../lib/run-json.js';
import type { PrProviderApi } from './reader.js';

/**
 * One GitHub PR's patch through `gh pr diff`, base to head as the PR shows it. GitHub refuses a
 * diff past its own limits (300 files, 20,000 lines); that comes back as a failed read.
 */
export const diffGithub: PrProviderApi['diff'] = (run, repo, number) =>
  runText(
    run,
    'gh',
    ['pr', 'diff', '--repo', repo, '--color', 'never', '--', String(Math.trunc(number))],
    60_000,
  );
