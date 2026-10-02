import type { IdSource } from '../lib/ids.js';

const ADJECTIVES = [
  'amber',
  'bold',
  'brisk',
  'calm',
  'clever',
  'cosmic',
  'crisp',
  'eager',
  'fuzzy',
  'gentle',
  'golden',
  'happy',
  'humble',
  'jolly',
  'keen',
  'lucky',
  'mellow',
  'nimble',
  'proud',
  'quiet',
  'rapid',
  'shiny',
  'silver',
  'snowy',
  'steady',
  'sunny',
  'swift',
  'tidy',
  'vivid',
  'witty',
  'young',
  'zesty',
];
const NOUNS = [
  'badger',
  'beacon',
  'canyon',
  'comet',
  'cove',
  'falcon',
  'fern',
  'harbor',
  'heron',
  'island',
  'lantern',
  'maple',
  'meadow',
  'otter',
  'owl',
  'panda',
  'pebble',
  'pine',
  'quartz',
  'raven',
  'reef',
  'river',
  'robin',
  'sparrow',
  'spruce',
  'tide',
  'tiger',
  'valley',
  'walrus',
  'willow',
  'wren',
  'zebra',
];

/**
 * A new session worktree's branch, as Xirp names one: `session/<adjective>-<noun>-<4 characters>`,
 * all from a new id's random end, so a test's ids name known branches.
 */
export function sessionBranchName(newId: IdSource) {
  const end = newId().slice(-6).toLowerCase();
  const pick = (words: string[], at: number) =>
    words[Number.parseInt(end.charAt(at), 36) % words.length];
  return `session/${pick(ADJECTIVES, 0)}-${pick(NOUNS, 1)}-${end.slice(2)}`;
}
