import type { ImpactReport } from '@mesa/core';
import { commandWith } from './spec';

/** Impact: what Mesa decided and kept, for the profile, one project or one session. */
export const impactCommands = {
  'impact.mark': commandWith<
    { moment: string; undo?: boolean },
    { moment: string; mark: 'not-right' | null }
  >(({ moment, undo }) => ['impact', 'mark', moment, undo ? '--undo' : '--not-right']),
  'impact.report': commandWith<{ days?: number; project?: string; session?: string }, ImpactReport>(
    ({ days, project, session }) => [
      'impact',
      ...(days ? ['--days', String(days)] : []),
      ...(project ? ['--project', project] : []),
      ...(session ? ['--session', session] : []),
    ],
  ),
};
