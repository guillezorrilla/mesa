import { clip } from '../lib/clip.js';
import type { CloudErrorGroup } from './errors.js';
import { strictNormalized } from './normalize.js';
import { foldedMessage } from './stack.js';
import type { CloudVolume } from './volume.js';

// What Ask reads of its whole range before the page of entries (CONTEXT.md, Ask (logs)): the error
// groups over the range, the severity counts per service from Cloud Monitoring's log_entry_count,
// the range's deploys when known, then a few deduplicated samples per group. Pure.

/** A deploy in the range, as the deploy markers' cloudDeploys() (#1266) gives it; none until then. */
export type RangeDeploy = { project: string; service: string; revision: string; at: string };

/** A read that failed is a note in the summary, never the Ask's error. */
type Read<T> = T | { failed: string };

export type RangeFacts = {
  since: string;
  errors: Read<{ groups: readonly CloudErrorGroup[] }>;
  volume: Read<CloudVolume>;
  deploys: readonly RangeDeploy[];
};

/** The most groups, services and deploys the summary lists, biggest or newest first. */
const LISTED = 20;
/** The most distinct samples a group gives. */
const SAMPLES = 3;
/** A group's message past this many characters is cut in the summary; its samples carry the rest. */
const TITLE_LIMIT = 300;
/** A sample's first line past this many characters is cut; its stack is folded, never cut. */
const SAMPLE_HEAD = 1000;

const BADGES = { new: 'New', back: 'Back again' } as const;

/** Whether a read of the range failed, leaving only why. */
export const readFailed = <T extends object>(read: Read<T>): read is { failed: string } =>
  'failed' in read;

/** `count` of `total` when a list is cut, else the count alone. */
const shown = (count: number, total: number) =>
  count < total ? `${count} of ${total}` : `${total}`;

/** The summary's text: the range's error groups, its counts per service, its deploys. */
export function rangeSummary(facts: RangeFacts) {
  const lines = [`Over the whole range (since ${facts.since}), not only the entries below:`, ''];
  if (readFailed(facts.errors)) lines.push(`Error groups: not read (${facts.errors.failed}).`);
  else {
    const { groups } = facts.errors;
    lines.push(
      `Error groups (${shown(Math.min(LISTED, groups.length), groups.length)}), biggest first:`,
    );
    for (const g of groups.slice(0, LISTED)) {
      const badge = g.badge ? ` ${BADGES[g.badge]},` : '';
      const services = g.services.join(', ') || 'no service';
      lines.push(
        `- x${g.count} in ${g.project} (${services}),${badge} first ${g.firstSeen}, last ${g.lastSeen}: ${clip(g.message, TITLE_LIMIT)} (group ${clip(g.id, 80)})`,
      );
    }
    if (!groups.length) lines.push('- none');
  }
  lines.push('');
  const volume = facts.volume;
  if (readFailed(volume)) lines.push(`Severity counts: not read (${volume.failed}).`);
  else if (!volume.counted) lines.push(`Severity counts: not counted (${volume.why}).`);
  else {
    const severities = (counts: Record<string, number>) =>
      Object.entries(counts)
        .map(([severity, count]) => `${severity} ${count}`)
        .join(', ');
    const services = volume.services ?? [];
    lines.push(
      `Severity counts over the range, Cloud Monitoring: ${severities(Object.fromEntries(volume.severities.map((s) => [s.severity, s.count])))}`,
    );
    if (services.length) {
      lines.push(`Per service (${shown(Math.min(LISTED, services.length), services.length)}):`);
      for (const s of services.slice(0, LISTED))
        lines.push(`- ${s.project}/${s.name} (${s.kind}): ${severities(s.severities)}`);
    }
  }
  lines.push('');
  if (facts.deploys.length) {
    const deploys = [...facts.deploys].sort((a, b) => b.at.localeCompare(a.at));
    lines.push(
      `Deploys in the range (${shown(Math.min(LISTED, deploys.length), deploys.length)}), newest first:`,
    );
    for (const d of deploys.slice(0, LISTED))
      lines.push(`- ${d.at} ${d.project}/${d.service} revision ${d.revision}`);
  } else lines.push('Deploys in the range: none known.');
  return lines.join('\n');
}

/**
 * A few samples of each group, as JSON lines `{group, time, service, message}`, biggest group
 * first: at most SAMPLES each, none whose first line is another's but for its ids and numbers,
 * each stack folded.
 */
export function groupSamples(groups: readonly CloudErrorGroup[]) {
  return groups.slice(0, LISTED).flatMap((g) => {
    const samples = g.samples?.length
      ? g.samples.map((e) => ({ time: e.time, service: e.service, message: e.message }))
      : [{ time: g.lastSeen, service: g.services[0] ?? null, message: g.sample || g.message }];
    const seen = new Set<string>();
    return samples
      .filter((s) => {
        const key = strictNormalized(s.message.split('\n', 1)[0] ?? '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, SAMPLES)
      .map((s) =>
        JSON.stringify({
          group: clip(g.id, 80),
          ...s,
          message: foldedMessage(s.message, SAMPLE_HEAD),
        }),
      );
  });
}
