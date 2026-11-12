import { expect, test } from 'vitest';
import { scheduleCron } from './scheduleCron';

test('a schedule and a time become cron; a time that does not read becomes nothing', () => {
  expect(scheduleCron('daily', '9:05')).toBe('5 9 * * *');
  expect(scheduleCron('weekdays', ' 18:30 ')).toBe('30 18 * * 1-5');
  expect(scheduleCron('weekends', '00:00')).toBe('0 0 * * 0,6');
  expect(scheduleCron('daily', '24:00')).toBeUndefined();
  expect(scheduleCron('daily', '9:5')).toBeUndefined();
  expect(scheduleCron('daily', 'nine')).toBeUndefined();
});
