// Claude Code's `/usage` reply read as data (#1218). In Structured mode claude 2.1.325 answers:
//
//   You are currently using your subscription to power your Claude Code usage
//
//   Current session: 14% used · resets Nov 16 at 2:10pm (America/Vancouver)
//   Current week (all models): 3% used · resets Nov 22 at 6pm (America/Vancouver)
//
//   What's contributing to your usage?
//   Approximate · sessions on this machine only · shares overlap
//
//   Last 24h · 594 requests · 24 sessions
//     93%  Start fresh when you switch tasks · run /clear
//     Top skills: /lantern 2%
//
// Labels, windows and lines come from the reply; nothing here names one.

/** One limit: its label, how much is used, and when it resets as the agent wrote it. */
export type PlanLimit = { label: string; percent: number; resets?: string };

/** One line under a window: a share of its usage and what it says, or a line of text alone. */
export type PlanUsageLine = { percent?: number; text: string };

/** One window of what contributes to usage (`Last 24h · 594 requests · 24 sessions`). */
export type PlanUsageWindow = { title: string; lines: PlanUsageLine[] };

export type PlanUsage = {
  /** The lines before the limits: which plan or account pays. */
  notes: string[];
  limits: PlanLimit[];
  /** What contributes to usage: its heading lines, then each window. */
  contributors: { notes: string[]; windows: PlanUsageWindow[] };
};

const LIMIT = /^(.+?): (\d+(?:\.\d+)?)% used(?: · resets (.+))?$/;
const SHARE = /^(\d+(?:\.\d+)?)%\s+(.+)$/;

/** The report in a `/usage` reply, or none when it names no limit. */
export function parsePlanUsage(output: string): PlanUsage | undefined {
  const report: PlanUsage = { notes: [], limits: [], contributors: { notes: [], windows: [] } };
  let window: PlanUsageWindow | undefined;
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const limit = LIMIT.exec(line);
    if (limit?.[1] && limit[2] && !window) {
      report.limits.push({
        label: limit[1],
        percent: Number(limit[2]),
        ...(limit[3] ? { resets: limit[3] } : {}),
      });
      continue;
    }
    if (!report.limits.length) {
      report.notes.push(line);
      continue;
    }
    // An indented line belongs to the window above it; another starts one or is a heading.
    if (/^\s/.test(raw) && window) {
      const share = SHARE.exec(line);
      window.lines.push(
        share?.[1] && share[2] ? { percent: Number(share[1]), text: share[2] } : { text: line },
      );
    } else if (/^Last\b/.test(line) || /\d+ requests?\b/.test(line)) {
      window = { title: line, lines: [] };
      report.contributors.windows.push(window);
    } else if (!window) report.contributors.notes.push(line);
    else window.lines.push({ text: line });
  }
  return report.limits.length ? report : undefined;
}
