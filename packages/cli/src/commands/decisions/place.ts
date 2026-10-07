import type { Placed } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { columns } from '../../output/columns.js';

export const decisionsPlace = defineCommand({
  name: 'decisions place',
  summary:
    'Ask the chosen model, if it passed the supervision gate, to place the sessions the Board is unsure of (no hook, no listing) from their screens; each reply is saved for the next mesa sessions. Run beside the Board read: nothing waits on it',
  example: 'mesa decisions place',
  run: async ({ mesa }) => {
    const placed = await mesa.decisions.place();
    const line = (p: Placed) =>
      'dropped' in p
        ? [p.id, `dropped: ${p.dropped}`]
        : [
            p.id,
            p.saved.placed
              ? `${p.saved.placed.state} (${p.saved.placed.source})`
              : `rules: ${p.saved.ask.fallbackReason ?? ''}`,
          ];
    return {
      data: { placed },
      text: placed.length ? columns(placed.map(line)).join('\n') : 'nothing to place',
    };
  },
});
