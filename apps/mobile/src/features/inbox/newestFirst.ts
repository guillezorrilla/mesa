import type { PhoneNotice } from '@mesa/core/phone';

/**
 * The notices newest first by when each happened, whatever order the Mac sent them in: its times
 * are compared as text, so one written without milliseconds sorts out of place among the rest.
 */
export const newestFirst = (notices: readonly PhoneNotice[]) =>
  [...notices].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
