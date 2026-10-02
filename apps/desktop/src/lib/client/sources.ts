import type { BrowseResult, SourceId, SourceRow } from '@mesa/core';
import { command, commandWith, type Recorded } from './spec';

/** Source commands: the profile's Connections (ADR-0014), and browsing a source's tree. */
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
  // A node's children, the root's without one (CONTEXT.md, Picker).
  'sources.browse': commandWith<
    { source: SourceId; node?: string; cursor?: string; search?: string; descendants?: boolean },
    BrowseResult
  >(({ source, node, cursor, search, descendants }) => [
    'sources',
    'browse',
    ...(cursor ? ['--cursor', cursor] : []),
    ...(search ? ['--search', search] : []),
    ...(descendants ? ['--descendants'] : []),
    '--',
    source,
    ...(node ? [node] : []),
  ]),
};
