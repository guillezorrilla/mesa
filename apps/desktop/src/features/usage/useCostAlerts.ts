import { costAlertText } from '@mesa/core/browser';
import { useEffect } from 'react';
import { useToast } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';
import type { WorkspaceView } from '@/lib/workspaceView';

/** How often the app checks the usage alerts. */
const COST_ALERTS_INTERVAL_MS = 300_000;

/**
 * Toasts each usage alert once per period and threshold, now and every five minutes; its action
 * opens Usage through `navigate`, which must be stable.
 */
export function useCostAlerts(navigate: (view: WorkspaceView) => void) {
  const run = useRun();
  const toast = useToast();
  useEffect(() => {
    let active = true;
    const announced = new Set<string>();
    const check = async () => {
      const report = await run('usage.list', {});
      if (!active || !report) return;
      const day = new Date().toISOString().slice(0, 10);
      for (const alert of report.alerts) {
        const key = `${alert.period}:${alert.period === 'month' ? day.slice(0, 7) : day}:${alert.thresholdUsd}`;
        if (announced.has(key)) continue;
        announced.add(key);
        toast(costAlertText(alert), 'alert', {
          label: 'Open Usage',
          onFollow: () => navigate({ kind: 'usage' }),
        });
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), COST_ALERTS_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [run, toast, navigate]);
}
