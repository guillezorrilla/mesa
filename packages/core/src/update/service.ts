import { compare, prerelease, satisfies, valid } from 'semver';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import type { profileService } from '../profile/service.js';
import { appBundle } from './bundle.js';
import { FEEDS, RELEASES_PAGE, REVOKED_LIST, UPDATE_LINK, type UpdateChannel } from './feeds.js';

/** A Tauri update manifest (`latest.json`), as #431 publishes it. */
const ManifestSchema = z.object({
  version: z.string().refine((v) => valid(v) !== null, 'must be a semver version'),
  notes: z.string().optional(),
  platforms: z.record(z.string(), z.object({ signature: z.string(), url: z.string().url() })),
});
type Manifest = z.infer<typeof ManifestSchema>;

const RevokedSchema = z.object({
  schemaVersion: z.literal(1),
  /** `version` is one version or a semver range. */
  revokedVersions: z.array(z.object({ version: z.string(), reason: z.string() })),
});

export type Revoked = { version: string; reason: string };
export type UpdateCheck = {
  current: string;
  channel: UpdateChannel;
  available: boolean;
  /** The newest version on the channel, when one is published. */
  latest?: string;
  notes?: string;
  /** The manifest `latest` came from: the one endpoint the app's updater reads. */
  feed?: string;
  revoked?: Revoked;
  /** Where a person downloads Mesa by hand. */
  page: string;
};
export type UpdateInstall = UpdateCheck & {
  /** Nothing newer, or the app was asked to download, verify and offer it. */
  outcome: 'up-to-date' | 'handed-to-app';
  /** The installed Mesa.app that was asked. */
  app?: string;
};

/** A channel nobody chose follows the running version: a beta tracks betas, a stable stables. */
const defaultChannel = (current: string): UpdateChannel =>
  prerelease(current) ? 'beta' : 'stable';

/**
 * Mesa's own updates (ADR-0018): the channel the profile follows, the newest version on it, the
 * versions revoked. Only the app installs: its updater downloads and verifies through Tauri's plugin
 * from the feed `check` picks, and `install` hands the update to it.
 */
export function updateService(
  ctx: MesaContext,
  config: Pick<ReturnType<typeof profileService>['config'], 'set'>,
) {
  const { http, version: current } = ctx.deps;
  const channel = (): UpdateChannel => ctx.configIfAny()?.update.channel ?? defaultChannel(current);

  /** A feed's manifest; none when the channel has no release yet (404). */
  const manifest = async (feed: string): Promise<Manifest | undefined> => {
    const response = await http(feed);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new MesaError('internal', `${feed} answered HTTP ${response.status}`);
    const parsed = ManifestSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new MesaError('internal', `${feed} is not an update manifest`);
    return parsed.data;
  };

  /** The newest release across the channel's feeds, with the feed it came from. */
  const newest = async (on: UpdateChannel) => {
    const found = await Promise.all(
      FEEDS[on].map(async (feed) => ({ feed, manifest: await manifest(feed) })),
    );
    return found
      .filter((f): f is { feed: string; manifest: Manifest } => f.manifest !== undefined)
      .sort((a, b) => compare(b.manifest.version, a.manifest.version))[0];
  };

  /** The running version's revocation, if `revoked.json` lists it; a failed read never blocks. */
  const revoked = async (): Promise<Revoked | undefined> => {
    try {
      const response = await http(REVOKED_LIST);
      if (!response.ok) return undefined;
      const list = RevokedSchema.parse(await response.json());
      const hit = list.revokedVersions.find((entry) =>
        satisfies(current, entry.version, { includePrerelease: true }),
      );
      return hit && { version: hit.version, reason: hit.reason };
    } catch {
      return undefined;
    }
  };

  /** What a person running this version sees on the profile's channel. */
  const check = async (): Promise<UpdateCheck> => {
    const on = channel();
    const [best, revocation] = await Promise.all([newest(on), revoked()]);
    // Downgrades are never offered: only a version above the running one is available.
    const available = best !== undefined && compare(best.manifest.version, current) > 0;
    return {
      current,
      channel: on,
      available,
      ...(best
        ? {
            latest: best.manifest.version,
            feed: best.feed,
            ...(best.manifest.notes ? { notes: best.manifest.notes } : {}),
          }
        : {}),
      ...(revocation ? { revoked: revocation } : {}),
      page: RELEASES_PAGE,
    };
  };

  return {
    current: () => current,
    channel: {
      get: channel,
      set: (to: UpdateChannel) => config.set('update.channel', to),
    },
    check,
    revoked,
    /**
     * Hands a newer version to the installed app this mesa belongs to: `open -a <app>` with
     * UPDATE_LINK starts the app if it is closed, and the app checks, downloads, verifies and
     * offers it, so a person still chooses Install. Nothing here downloads or replaces a file.
     */
    install: async (): Promise<UpdateInstall> => {
      const found = await check();
      if (!found.available) return { ...found, outcome: 'up-to-date' };
      const app = appBundle(ctx.deps.self, RELEASES_PAGE);
      const opened = await ctx.deps.run('/usr/bin/open', ['-a', app, UPDATE_LINK], 10_000);
      if (!opened.ok) throw new MesaError('internal', `Cannot open ${app}: ${opened.detail}`);
      return { ...found, outcome: 'handed-to-app', app };
    },
  };
}
