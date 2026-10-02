import type { UsageReport, WeeklyRewind } from '@mesa/core';
import { command, commandWith } from './spec';

/** Usage commands: token use and cost, and the weekly rewind. */
export const usageCommands = {
  'usage.list': commandWith<{ session?: string }, UsageReport>(({ session }) => [
    'usage',
    ...(session ? ['--session', session] : []),
  ]),
  'rewind.week': command<WeeklyRewind>('rewind'),
};
