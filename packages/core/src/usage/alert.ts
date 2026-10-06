import { usd } from '../lib/format.js';
import type { UsageReport } from './records.js';

/**
 * The sentence a reached cost alert reads as, in the app's toast and in `mesa usage`:
 * `Known estimated today cost reached your $5.00 alert. Agents keep running.`
 */
export const costAlertText = (
  alert: Pick<UsageReport['alerts'][number], 'period' | 'thresholdUsd'>,
) =>
  `Known estimated ${alert.period === 'month' ? 'calendar month' : alert.period} cost reached your ${usd(alert.thresholdUsd, 2)} alert. Agents keep running.`;
