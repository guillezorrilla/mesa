import { describe, expect, it } from 'vitest';
import type { WorktreeAction } from './facts.js';
import { type CheckoutDecision, worktreeReasons } from './reasons.js';

/** A clean, published branch in a ready worktree that nothing holds. */
const clean: CheckoutDecision = {
  kind: 'checkout',
  state: 'ready',
  branch: 'lantern',
  live: [],
  holders: [],
  changes: [],
  ignored: [],
  unpublished: false,
  base: 'origin/main',
  destinationTaken: false,
};

describe('worktreeReasons for one linked worktree', () => {
  it.each<[string, Partial<CheckoutDecision>, WorktreeAction, ReturnType<typeof worktreeReasons>]>([
    ['a clean remove', {}, 'remove', { blocked: [], work: [] }],
    ['a clean recycle', {}, 'recycle', { blocked: [], work: [] }],
    ['a clean trash', {}, 'trash', { blocked: [], work: [] }],
    [
      'a locked worktree',
      { state: 'locked' },
      'trash',
      { blocked: ['worktree is locked'], work: [] },
    ],
    ['a recycled worktree removed', { state: 'recycled' }, 'remove', { blocked: [], work: [] }],
    [
      'a recycled worktree recycled again',
      { state: 'recycled' },
      'recycle',
      { blocked: ['worktree is recycled'], work: [] },
    ],
    [
      'a running session',
      { live: ['s1'], holders: ['s1'] },
      'remove',
      { blocked: ['session s1 runs in this worktree; stop it first'], work: [] },
    ],
    [
      'a retained reference trashed',
      { holders: ['s2'] },
      'trash',
      { blocked: ['a session still references this worktree'], work: [] },
    ],
    [
      'local work removed',
      { holders: ['s2'], changes: [' M a.ts'], ignored: ['dist/'], unpublished: true },
      'remove',
      {
        blocked: [],
        work: [
          'a session still references this worktree',
          'worktree has changed or untracked files',
          'worktree has ignored files',
          'branch has unpublished commits or is detached',
        ],
      },
    ],
    [
      'changes recycled',
      { changes: ['?? notes.md'] },
      'recycle',
      { blocked: ['worktree has uncommitted changes; commit, stash, or trash it'], work: [] },
    ],
    [
      'a recycle with no default branch',
      { base: undefined },
      'recycle',
      { blocked: ['no default branch to reset to'], work: [] },
    ],
    [
      'a detached HEAD with unpublished commits recycled',
      { branch: undefined, state: 'detached', unpublished: true },
      'recycle',
      {
        blocked: ['detached HEAD has commits no branch holds; make a branch or trash it'],
        work: [],
      },
    ],
    [
      'a taken trash destination',
      { destinationTaken: true },
      'trash',
      { blocked: ['recycle destination already exists'], work: [] },
    ],
    [
      'local work trashed',
      { changes: [' M a.ts'], unpublished: true },
      'trash',
      { blocked: [], work: [] },
    ],
  ])('%s', (_, change, action, expected) => {
    expect(worktreeReasons({ ...clean, ...change }, action)).toEqual(expected);
  });
});

describe('worktreeReasons for a cleanup', () => {
  it.each([
    ['missing registrations nobody references', { missing: ['/w/a'], holders: [], onDisk: [] }, []],
    [
      'nothing to clean',
      { missing: [], holders: [], onDisk: [] },
      ['no missing worktrees to clean'],
    ],
    [
      'a referenced registration and one still on disk',
      { missing: ['/w/a'], holders: ['s1'], onDisk: ['/w/b'] },
      [
        'a session still references a missing worktree',
        '/w/b is prunable but still on disk; repair or remove it first',
      ],
    ],
  ])('%s', (_, facts, blocked) => {
    expect(worktreeReasons({ kind: 'cleanup', ...facts }, 'cleanup')).toEqual({
      blocked,
      work: [],
    });
  });
});
