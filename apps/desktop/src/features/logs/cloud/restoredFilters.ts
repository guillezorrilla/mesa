import type { GcpLogs } from '@mesa/core';
import { ALL_ENVS } from '@mesa/core/browser';
import type { CloudFilters } from '@/lib/client/logs';

/**
 * Kept Logs filters checked against the setup now (CONTEXT.md, Cloud Logs): an env no longer set
 * up falls back to the first one, projects no longer in logs.gcp.projects (and their services)
 * are left out; each fallback with a short note saying what changed.
 */
export function restoredFilters(filters: CloudFilters, gcp: Pick<GcpLogs, 'projects' | 'envs'>) {
  const notes: string[] = [];
  let next = filters;
  const envs = Object.keys(gcp.envs);
  if (next.env && next.env !== ALL_ENVS && !envs.includes(next.env)) {
    notes.push(`The env ${next.env} is no longer set up: showing ${envs[0] ?? 'every env'}.`);
    next = { ...next, env: undefined };
  }
  const gone = (next.projects ?? []).filter((p) => !gcp.projects.includes(p));
  if (gone.length) {
    const kept = (next.projects ?? []).filter((p) => gcp.projects.includes(p));
    notes.push(
      `${gone.join(', ')} ${gone.length === 1 ? 'is' : 'are'} no longer in your projects: left out.`,
    );
    next = { ...next, projects: kept.length ? kept : undefined };
  }
  const services = (next.services ?? []).filter((ref) =>
    gcp.projects.includes(ref.split('/')[0] ?? ''),
  );
  if (services.length !== (next.services ?? []).length) {
    if (!gone.length) notes.push('Services of projects no longer set up are left out.');
    next = { ...next, services: services.length ? services : undefined };
  }
  return { filters: next, notes };
}
