import { expect, test } from 'vitest';
import { repoOfRemote } from './github.js';
import { resolveLink } from './links.js';

const GITHUB = { github: [{ id: 'rowan-tide', name: 'rowan-tide', url: 'https://github.com/rowan-tide' }] };
const ISSUE = {
  source: 'github',
  id: 'harbor-co/harbor-api/421',
  url: 'https://github.com/harbor-co/harbor-api/issues/421',
};

test('a GitHub issue link or key imports as a GitHub issue once GitHub is connected', () => {
  expect(resolveLink('harbor-co/harbor-api#421', GITHUB)).toEqual(ISSUE);
  expect(
    resolveLink('https://github.com/harbor-co/harbor-api/issues/421#issuecomment-1', GITHUB),
  ).toEqual(ISSUE);
  expect(() => resolveLink('harbor-co/harbor-api#421', {})).toThrow(
    'GitHub is not connected: run mesa sources connect github',
  );
  // Without GitHub connected, and for any other github.com page, a link is the web page it was.
  expect(resolveLink('https://github.com/harbor-co/harbor-api/issues/421', {})).toMatchObject({
    source: 'web',
  });
  expect(resolveLink('https://github.com/harbor-co/harbor-api', GITHUB)).toMatchObject({
    source: 'web',
  });
});

test("a project's origin remote names its repo on github.com, over https or ssh", () => {
  expect(repoOfRemote('https://github.com/harbor-co/harbor-api.git\n')).toBe(
    'harbor-co/harbor-api',
  );
  expect(repoOfRemote('git@github.com:harbor-co/tide.feed')).toBe('harbor-co/tide.feed');
  expect(repoOfRemote('https://gitlab.com/harbor-co/harbor-api.git')).toBeUndefined();
});
