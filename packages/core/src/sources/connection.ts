import { z } from 'zod';
import type { SecretStore } from '../lib/secret-store.js';

const siteSchema = z.object({ id: z.string(), name: z.string(), url: z.string() });

const connectionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** When the access token stops working, ISO. */
  expiresAt: z.string(),
  sites: z.array(siteSchema),
  /** needs-reconnect once the source refused the refresh token (revoked, or expired). */
  status: z.enum(['connected', 'needs-reconnect']),
});

/**
 * A signed-in source as the Keychain keeps it (CONTEXT.md, Connection): its tokens and the sites
 * they reach, and nothing about the person (the account is read live, never stored).
 */
export type Connection = z.infer<typeof connectionSchema>;
/** One site (an Atlassian cloud site) a connection reaches. */
export type Site = z.infer<typeof siteSchema>;
/** The signed-in account, read from the source when shown. */
export type Account = { id: string; name: string; email?: string };

/** JSON with every character past ASCII escaped, as a Keychain value must be (keychainStore). */
const asciiJson = (value: unknown) =>
  JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );

/**
 * One profile's connections: Keychain service `mesa.<profile>.sources`, one item per source. The
 * tokens live here and nowhere else.
 */
export function connectionStore(store: SecretStore, profile: string) {
  const service = `mesa.${profile}.sources`;
  return {
    /** The source's connection; none when it has none, or one that no longer reads. */
    read: async (source: string): Promise<Connection | undefined> => {
      const raw = await store.get(service, source);
      if (raw === undefined) return undefined;
      try {
        const parsed = connectionSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : undefined;
      } catch {
        return undefined;
      }
    },
    write: (source: string, connection: Connection) =>
      store.set(service, source, asciiJson(connection)),
    /** False when the source had no connection. */
    remove: (source: string) => store.delete(service, source),
  };
}

export type ConnectionStore = ReturnType<typeof connectionStore>;
