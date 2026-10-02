import type { WorktreeAction } from '@mesa/core';
import type { Card } from './WorktreeCard';

/** What a card's status line says, by state: an apply running, a session in it, its changes, or clean. */
export function statusOf(tree: Card, applying?: WorktreeAction) {
  if (applying) return applying === 'remove' ? 'Removing...' : 'Recycling...';
  const held = tree.holders[0];
  if (held) return held.name ?? held.state;
  if (tree.state !== 'ready' && tree.state !== 'detached') return tree.state;
  const { staged = 0, modified = 0, untracked = 0 } = tree.changes ?? {};
  const parts = [
    modified && `${modified} modified`,
    staged && `${staged} staged`,
    untracked && `${untracked} untracked`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'clean';
}
