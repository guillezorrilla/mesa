import { expect, test } from 'vitest';
import { axisMoney, chartScale, dayAt } from './chartScale';

test('the scale ends at a round top, so a small day still reads beside a dominant one', () => {
  const scale = chartScale([522, 3, null, 0]);
  expect(scale.top).toBe(600);
  expect(scale.labels).toEqual(['$600', '$300', '$0']);
  expect(scale.shares).toEqual([0.87, 0.005, 0, 0]);
  expect(chartScale([0.03]).labels).toEqual(['$0.04', '$0.02', '$0']);
  expect(chartScale([6]).top).toBe(6);
  expect(chartScale([1400]).labels).toEqual(['$2k', '$1k', '$0']);
});

test('a chart with no cost has no top and every bar empty', () => {
  expect(chartScale([null, 0])).toEqual({ top: 0, labels: [], shares: [0, 0] });
});

test('the axis prints a value short', () => {
  expect(axisMoney(0)).toBe('$0');
  expect(axisMoney(0.6000000000000001)).toBe('$0.6');
  expect(axisMoney(1200)).toBe('$1.2k');
});

test('a finger picks the day under it, held to the chart', () => {
  expect(dayAt(0, 140, 14)).toBe(0);
  expect(dayAt(15, 140, 14)).toBe(1);
  expect(dayAt(139, 140, 14)).toBe(13);
  expect(dayAt(-20, 140, 14)).toBe(0);
  expect(dayAt(400, 140, 14)).toBe(13);
});
