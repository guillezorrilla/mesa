/** Mesa's GitHub repository. */
export const REPOSITORY = 'https://github.com/guillezorrilla/mesa';
/** Where Mesa's releases live (#431, ADR-0017): static GitHub Release assets, never api.github.com. */
export const RELEASES_PAGE = `${REPOSITORY}/releases`;

export const UPDATE_CHANNELS = ['stable', 'beta'] as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

/**
 * Each channel's update manifests, read in order. `latest` skips prereleases; `beta` is the fixed
 * prerelease whose `latest.json` each beta replaces. Beta reads stable too, so a stable release
 * newer than the newest beta is offered on both.
 */
export const FEEDS: Record<UpdateChannel, readonly string[]> = {
  stable: [`${RELEASES_PAGE}/latest/download/latest.json`],
  beta: [
    `${RELEASES_PAGE}/download/beta/latest.json`,
    `${RELEASES_PAGE}/latest/download/latest.json`,
  ],
};

/** The versions no one should keep running, with the reason (ADR-0018). */
export const REVOKED_LIST = `${RELEASES_PAGE}/download/beta/revoked.json`;

/** The link that asks a running app to check for an update and offer it (`mesa update install`). */
export const UPDATE_LINK = 'mesa://update/install';
