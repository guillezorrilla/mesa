import type { SourceId, SourceRow } from '@mesa/core';
import { command, commandWith, type Recorded } from './spec';

/** Source commands: the profile's Connections (ADR-0014). */
export const sourcesCommands = {
  'sources.list': command<{ sources: SourceRow[] }>('sources', 'list'),
  // Waits for the person to sign in in the browser, up to five minutes.
  'sources.connect': commandWith<{ source: SourceId }, Recorded<SourceRow>>(({ source }) => [
    'sources',
    'connect',
    source,
  ]),
  'sources.disconnect': commandWith<
    { source: SourceId },
    Recorded<{ source: SourceId; removed: boolean }>
  >(({ source }) => ['sources', 'disconnect', source]),
};
