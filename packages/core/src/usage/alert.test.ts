import { expect, test } from 'vitest';
import { costAlertText } from './alert.js';

test('a reached cost alert reads as one sentence in the app and the CLI', () => {
  expect(costAlertText({ period: 'today', thresholdUsd: 1 })).toBe(
    'Known estimated today cost reached your $1.00 alert. Agents keep running.',
  );
  expect(costAlertText({ period: 'month', thresholdUsd: 25.5 })).toBe(
    'Known estimated calendar month cost reached your $25.50 alert. Agents keep running.',
  );
});
