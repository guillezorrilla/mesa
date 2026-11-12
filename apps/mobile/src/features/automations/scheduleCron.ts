// A simple schedule as the phone offers it (#1067): which days and a time, as the five-field cron
// core's rule schema takes and describeAutomation reads back as words.

export const SCHEDULES = [
  ['daily', 'Every day'],
  ['weekdays', 'Weekdays'],
  ['weekends', 'Weekends'],
] as const;
export type Schedule = (typeof SCHEDULES)[number][0];

const WEEKDAY: Record<Schedule, string> = { daily: '*', weekdays: '1-5', weekends: '0,6' };

/** `schedule` at `time` (24-hour `H:MM` or `HH:MM`) as cron; undefined when the time does not read. */
export function scheduleCron(schedule: Schedule, time: string) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return undefined;
  return `${Number(match[2])} ${Number(match[1])} * * ${WEEKDAY[schedule]}`;
}
