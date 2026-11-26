import type { CloudDeploy } from './deploys.js';

// How a deploy reads beside the logs (CONTEXT.md, Cloud Logs): its revision in short, and the deploy
// an error group started soon after. Pure, so the app bundles it (`@mesa/core/browser`).

/** How soon after a deploy an error group's start is put down to it. */
export const DEPLOY_WINDOW_MS = 15 * 60_000;

/** A revision as a person reads it: Cloud Run's `<service>-00213-abc` as `00213`, any other whole. */
export function revisionLabel(deploy: Pick<CloudDeploy, 'service' | 'revision'>) {
  const own = deploy.revision.startsWith(`${deploy.service}-`)
    ? deploy.revision.slice(deploy.service.length + 1)
    : deploy.revision;
  return /^(\d+)-[a-z0-9]{3}$/.exec(own)?.[1] ?? own;
}

/** A deploy in words: `api-2 rev 00213`. */
export const deployName = (deploy: Pick<CloudDeploy, 'service' | 'revision'>) =>
  `${deploy.service} rev ${revisionLabel(deploy)}`;

/** The latest deploy of one of `group`'s services that its first error came within 15 minutes of. */
export function deployBefore(
  group: { project: string; services: readonly string[]; firstSeen: string },
  deploys: readonly CloudDeploy[],
): CloudDeploy | undefined {
  const first = Date.parse(group.firstSeen);
  return deploys
    .filter((d) => {
      const after = first - Date.parse(d.at);
      return (
        d.project === group.project &&
        group.services.includes(d.service) &&
        after >= 0 &&
        after <= DEPLOY_WINDOW_MS
      );
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
}

/** `started 2 min after api-2 rev 00213` when `group` started soon after a deploy of its service. */
export function startedAfter(
  group: { project: string; services: readonly string[]; firstSeen: string },
  deploys: readonly CloudDeploy[],
): string | undefined {
  const deploy = deployBefore(group, deploys);
  if (!deploy) return undefined;
  const minutes = Math.round((Date.parse(group.firstSeen) - Date.parse(deploy.at)) / 60_000);
  return `started ${minutes < 1 ? 'under a minute' : `${minutes} min`} after ${deployName(deploy)}`;
}
