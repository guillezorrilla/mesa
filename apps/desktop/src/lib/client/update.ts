import type { UpdateChannel } from '@mesa/core';
import { command, commandWith, type Recorded } from './spec';

/** The update channel the profile follows; the app's updater itself runs in Rust (ADR-0018). */
export const updateCommands = {
  'update.channel': command<{ channel: UpdateChannel }>('update', 'channel'),
  'update.channel.set': commandWith<
    { channel: UpdateChannel },
    Recorded<{ channel: UpdateChannel }>
  >(({ channel }) => ['update', 'channel', channel]),
};
