import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import { createFileAtomic, writeFileAtomic } from '../lib/atomic-file.js';
import { profilesDir } from '../profile/paths.js';
import { brokerUrl } from '../sources/broker.js';
import type { UpdateChannel } from '../update/feeds.js';

// The anonymous install count (ADR-0026): one random ID per Mac, sent with Mesa's version and
// channel at most once a day, and the switch that stops it and erases what the broker kept.

const InstallSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
  /** The last ping the broker took, and the version it carried. */
  sent: z.object({ at: z.string(), version: z.string() }).optional(),
});
type Install = z.infer<typeof InstallSchema>;

export type InstallStatus = { id: string | null; enabled: boolean; lastSentAt: string | null };

/** How long a ping or an erase may take: the update check runs one beside its feed reads. */
const PING_TIMEOUT_MS = 5_000;
const DAY_MS = 86_400_000;

export function installsService(
  ctx: Pick<MesaContext, 'home' | 'env' | 'http' | 'clock' | 'newUuid' | 'version' | 'release'>,
) {
  const file = join(profilesDir(ctx.home), 'install.json');

  /** The Mac's install record; none before the first ping or switch, or when it does not read. */
  const read = (): Install | undefined => {
    if (!existsSync(file)) return undefined;
    try {
      return InstallSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      return undefined;
    }
  };

  /** The record, made with a new ID the first time; two processes racing keep the first one's. */
  const ensure = (enabled = true): Install => {
    const found = read();
    if (found) return found;
    mkdirSync(profilesDir(ctx.home), { recursive: true });
    const made: Install = { id: ctx.newUuid(), enabled };
    if (createFileAtomic(file, `${JSON.stringify(made, null, 2)}\n`)) return made;
    return read() ?? made;
  };

  const save = (install: Install) => writeFileAtomic(file, `${JSON.stringify(install, null, 2)}\n`);

  const call = (path: string, init: RequestInit) =>
    ctx
      .http(`${brokerUrl(ctx.env)}${path}`, {
        ...init,
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      })
      .then((response) => response.ok)
      .catch(() => false);

  return {
    status: (): InstallStatus => {
      const found = read();
      return {
        id: found?.id ?? null,
        enabled: found?.enabled ?? true,
        lastSentAt: found?.sent?.at ?? null,
      };
    },

    /**
     * Sends the install ping when it is due: never sent, sent with another version, or a day ago.
     * Off, `MESA_NO_INSTALL_PING=1` or a development build sends nothing. Never throws.
     */
    ping: async (channel: UpdateChannel): Promise<void> => {
      if (!ctx.release || ctx.env.MESA_NO_INSTALL_PING === '1') return;
      try {
        const install = ensure();
        const now = ctx.clock();
        const { sent } = install;
        if (!install.enabled) return;
        if (sent?.version === ctx.version && now.getTime() - Date.parse(sent.at) < DAY_MS) return;
        const body = { id: install.id, version: ctx.version, channel };
        const took = await call('/installs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (took)
          save({ ...(read() ?? install), sent: { at: now.toISOString(), version: ctx.version } });
      } catch {
        // The count is informational: a failure waits for the next check.
      }
    },

    /** Turns the ping on or off; off also asks the broker to erase this install. */
    set: async (enabled: boolean): Promise<InstallStatus & { erased?: boolean }> => {
      const install = ensure(enabled);
      const { sent: _, ...kept } = install;
      save(enabled ? { ...install, enabled } : { ...kept, enabled });
      const status = {
        id: install.id,
        enabled,
        lastSentAt: enabled ? (install.sent?.at ?? null) : null,
      };
      if (enabled) return status;
      const erased = await call(`/installs/${install.id}`, { method: 'DELETE' });
      return { ...status, erased };
    },
  };
}
