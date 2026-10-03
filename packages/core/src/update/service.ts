import { compare, prerelease, satisfies, valid } from 'semver';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import type { profileService } from '../profile/service.js';
import { FEEDS, RELEASES_PAGE, REVOKED_LIST, UPDATE_LINK, type UpdateChannel } from './feeds.js';
import { appBundle, replaceBundle } from './install.js';
import { UPDATE_PUBLIC_KEY, verifyMinisign } from './minisign.js';

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
  /** Nothing newer, the running app was asked to install it, or the app bundle was replaced. */
  outcome: 'up-to-date' | 'handed-to-app' | 'replaced';
  app?: string;
};

/** A channel nobody chose follows the running version: a beta tracks betas, a stable stables. */
const defaultChannel = (current: string): UpdateChannel =>
  prerelease(current) ? 'beta' : 'stable';

/**
 * Mesa's own updates (ADR-0018): the channel the profile follows, the newest version on it, the
 * versions revoked, and an install for the CLI. The app's updater installs through Tauri's plugin
 * from the feed `check` picks.
 */
export function updateService(
  ctx: MesaContext,
  config: Pick<ReturnType<typeof profileService>['config'], 'set'>,
  /** The key updates must be signed with: #431's, or a test's own. */
  publicKey = UPDATE_PUBLIC_KEY,
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

  /** The check, and the newer release's manifest when there is one. */
  const inspect = async () => {
    const on = channel();
    const [best, revocation] = await Promise.all([newest(on), revoked()]);
    // Downgrades are never offered: only a version above the running one is available.
    const available = best !== undefined && compare(best.manifest.version, current) > 0;
    const found: UpdateCheck = {
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
    return { found, newer: available ? best : undefined };
  };

  return {
    current: () => current,
    channel: {
      get: channel,
      set: (to: UpdateChannel) => config.set('update.channel', to),
    },
    check: async () => (await inspect()).found,
    revoked,
    /**
     * Downloads the newest version, verifies its signature, and hands the install to the running
     * app (which offers it in its dialog) or, with the app closed, replaces this app bundle.
     */
    install: async (): Promise<UpdateInstall> => {
      const { found, newer: best } = await inspect();
      if (!best) return { ...found, outcome: 'up-to-date' };
      const app = appBundle(ctx.deps.self, RELEASES_PAGE);
      // ponytail: one universal archive (ADR-0017) serves both entries; pick by arch if they split.
      const platform =
        best.manifest.platforms['darwin-aarch64'] ?? best.manifest.platforms['darwin-x86_64'];
      if (!platform) throw new MesaError('not_found', `${best.feed} has no macOS archive`);
      const response = await http(platform.url);
      if (!response.ok)
        throw new MesaError('internal', `${platform.url} answered HTTP ${response.status}`);
      const archive = new Uint8Array(await response.arrayBuffer());
      verifyMinisign(archive, platform.signature, publicKey);
      const { run } = ctx.deps;
      if ((await run('/usr/bin/pgrep', ['-x', 'mesa-desktop'], 5_000)).ok) {
        const opened = await run('/usr/bin/open', [UPDATE_LINK], 10_000);
        if (!opened.ok) throw new MesaError('internal', `Cannot reach the app: ${opened.detail}`);
        return { ...found, outcome: 'handed-to-app', app };
      }
      await replaceBundle(app, archive, run);
      return { ...found, outcome: 'replaced', app };
    },
  };
}
