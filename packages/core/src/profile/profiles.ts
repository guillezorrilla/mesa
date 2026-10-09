import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { automationLaunchd } from '../automations/launchd.js';
import type { MesaContext } from '../context.js';
import { decisionKeys, KEY_PROVIDERS } from '../decisions/keys.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { MesaError } from '../lib/result.js';
import { readRegistry } from '../projects/registry.js';
import { tmuxBackend } from '../sessions/tmux/backend.js';
import { connectionStore } from '../sources/connection.js';
import { SOURCE_IDS } from '../sources/sources.js';
import { vaultChoices } from '../vault/obsidian.js';
import { loadConfig, portableSettings } from './config.js';
import { appProfileFile, type ProfilePaths, profilePaths, profilesDir } from './paths.js';
import { createProfile } from './profile.js';
import { profileName, profileVault, validProfileName } from './profile-name.js';

/** One profile as `mesa profile list` shows it. */
export type ProfileRow = {
  name: string;
  dir: string;
  /** Its vault; null when its config does not read. */
  vault: string | null;
  projects: number;
  /** Windows still running on its tmux server. */
  liveSessions: number;
  /** When a session record or its config last changed, ISO. */
  lastUsed: string;
  /** The profile this command runs under. */
  current: boolean;
  /** The profile the app opens when no MESA_PROFILE is set (`mesa profile use`). */
  app: boolean;
};

/**
 * Every profile on this Mac (CONTEXT.md, Profile): listing, creating, renaming and removing them,
 * and which one the app opens. A profile's folder, tmux server, scheduler and Keychain items all
 * carry its name, so rename and remove handle them together.
 */
export function profilesService(ctx: MesaContext) {
  const appFile = appProfileFile(ctx.home);
  const pathsOf = (name: string) => profilePaths(ctx.home, name);
  const appProfile = () => (existsSync(appFile) ? readFileSync(appFile, 'utf8').trim() : undefined);
  const setAppProfile = (name: string) => writeFileAtomic(appFile, `${name}\n`, 0o600);
  const names = () =>
    existsSync(profilesDir(ctx.home))
      ? readdirSync(profilesDir(ctx.home))
          .filter((name) => validProfileName(name) && existsSync(pathsOf(name).config))
          .sort()
      : [];
  const vaultOf = (paths: ProfilePaths) => {
    try {
      return loadConfig(paths.config).vault;
    } catch {
      return null;
    }
  };
  /** An initialised profile's paths, or not_found. */
  const existing = (name: string) => {
    const paths = pathsOf(profileName(name));
    if (!existsSync(paths.config)) throw new MesaError('not_found', `no profile ${name}`);
    return paths;
  };
  const tmuxOf = (name: string) =>
    tmuxBackend({ run: ctx.run, socket: pathsOf(name).tmuxSocket, env: ctx.env, sleep: ctx.sleep });
  // No tmux, no sessions.
  const liveSessions = async (name: string) =>
    (
      await tmuxOf(name)
        .listWindows()
        .catch(() => [])
    ).filter((w) => !w.dead).length;
  /** Rename and remove wait until nothing runs under the profile's name. */
  const refuseWhileRunning = async (name: string, doing: string) => {
    const live = await liveSessions(name);
    if (live)
      throw new MesaError(
        'usage',
        `cannot ${doing} profile ${name}: ${live} session${live === 1 ? '' : 's'} still running; stop ${live === 1 ? 'it' : 'them'} first`,
      );
    if (automationLaunchd({ ...ctx, profile: name, paths: pathsOf(name) }).exists())
      throw new MesaError(
        'usage',
        `cannot ${doing} profile ${name}: its automation scheduler is installed; run mesa --profile ${name} automations uninstall first`,
      );
  };
  const decisions = (name: string) => decisionKeys(ctx.secretStore, name);
  const connections = (name: string) => connectionStore(ctx.secretStore, name);
  const copySecrets = async (from: string, to: string) => {
    for (const provider of KEY_PROVIDERS) {
      const stored = await decisions(from).read(provider);
      if (stored)
        await decisions(to).write(
          provider,
          stored.key,
          stored.addedAt ?? ctx.clock().toISOString(),
        );
    }
    for (const source of SOURCE_IDS) {
      const connection = await connections(from).read(source);
      if (connection) await connections(to).write(source, connection);
    }
  };
  const deleteSecrets = async (name: string) => {
    for (const provider of KEY_PROVIDERS) await decisions(name).remove(provider);
    for (const source of SOURCE_IDS) await connections(name).remove(source);
  };

  return {
    list: async (): Promise<ProfileRow[]> => {
      const app = appProfile();
      return Promise.all(
        names().map(async (name) => {
          const paths = pathsOf(name);
          const changed = [paths.sessions, paths.config].map(
            (path) => statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? 0,
          );
          return {
            name,
            dir: paths.root,
            vault: vaultOf(paths),
            projects: readRegistry(paths.registry).length,
            liveSessions: await liveSessions(name),
            lastUsed: new Date(Math.max(...changed)).toISOString(),
            current: name === ctx.profile,
            app: name === (app ?? 'default'),
          };
        }),
      );
    },
    /**
     * A new profile with its own vault: `vault`, which may already hold one, or with `newVault` a
     * new folder beside the suggested first vault. `copySettings` starts it from this profile's
     * settings, without its vault and keys; its setup guide runs either way.
     */
    create: (input: {
      name: string;
      vault?: string;
      newVault?: boolean;
      copySettings?: boolean;
    }) => {
      const paths = pathsOf(profileName(input.name));
      if (existsSync(paths.root))
        throw new MesaError('usage', `profile ${input.name} already exists`);
      if (!input.vault === !input.newVault)
        throw new MesaError('usage', 'choose a vault: --vault <path> or --new-vault');
      const vault = input.vault
        ? ctx.absolute(input.vault)
        : profileVault(vaultChoices(ctx.obsidian, ctx.home).suggested, input.name);
      if (input.newVault && existsSync(vault))
        throw new MesaError('usage', `${vault} already exists; pass --vault ${vault} to use it`);
      const settings = input.copySettings ? portableSettings(ctx.open().config) : undefined;
      const { vaultCreated } = createProfile(
        paths,
        { vault, ...(settings ? { settings } : {}) },
        ctx.clock,
      );
      return { profile: input.name, dir: paths.root, vault, vaultCreated };
    },
    /**
     * Moves the profile's folder, tmux socket name and Keychain items to `to`. Refused while its
     * sessions run, its scheduler is installed, or it has worktrees (git knows them by path).
     */
    rename: async (from: string, to: string) => {
      const old = existing(from);
      const next = pathsOf(profileName(to));
      if (existsSync(next.root)) throw new MesaError('usage', `profile ${to} already exists`);
      await refuseWhileRunning(from, 'rename');
      // Project folders only: Finder leaves a .DS_Store beside them.
      const worktrees = existsSync(old.worktrees)
        ? readdirSync(old.worktrees, { withFileTypes: true }).filter((entry) => entry.isDirectory())
        : [];
      if (worktrees.some((project) => readdirSync(join(old.worktrees, project.name)).length))
        throw new MesaError(
          'usage',
          `cannot rename profile ${from}: it has worktrees, which git knows by their folder; remove them first`,
        );
      // A server left with exited windows only would keep the old socket name.
      await tmuxOf(from).killServer();
      // Copied before the move and deleted after it, so a failure loses no key.
      await copySecrets(from, to);
      renameSync(old.root, next.root);
      // Projects cloned for the profile, and its sessions in them, are kept by absolute path.
      const files = [
        next.registry,
        ...(existsSync(next.sessions)
          ? readdirSync(next.sessions)
              .filter((file) => file.endsWith('.json'))
              .map((file) => join(next.sessions, file))
          : []),
      ];
      for (const file of files.filter((f) => existsSync(f))) {
        const text = readFileSync(file, 'utf8');
        const moved = text.replaceAll(`${old.root}/`, `${next.root}/`);
        if (moved !== text) writeFileAtomic(file, moved, 0o600);
      }
      await deleteSecrets(from);
      if (appProfile() === from) setAppProfile(to);
      return { from, to, dir: next.root };
    },
    /**
     * Stops the profile's tmux server and forgets it: its folder (config, projects, sessions'
     * records) and its Keychain items. Its vault is kept unless `deleteVault`. Refused for the
     * profile in use and while anything runs under it.
     */
    remove: async (name: string, { deleteVault = false } = {}) => {
      const paths = existing(name);
      if (name === ctx.profile)
        throw new MesaError(
          'usage',
          `cannot remove profile ${name} while using it; switch to another profile first`,
        );
      await refuseWhileRunning(name, 'remove');
      const vault = vaultOf(paths);
      const sharing =
        deleteVault &&
        vault !== null &&
        names().find((other) => other !== name && vaultOf(pathsOf(other)) === vault);
      if (sharing)
        throw new MesaError(
          'usage',
          `cannot delete ${vault}: profile ${sharing} uses it too; remove without deleting the vault`,
        );
      await tmuxOf(name).killServer();
      await deleteSecrets(name);
      rmSync(paths.root, { recursive: true, force: true });
      const vaultDeleted = deleteVault && vault !== null && existsSync(vault);
      if (vaultDeleted) rmSync(vault, { recursive: true, force: true });
      if (appProfile() === name) rmSync(appFile, { force: true });
      return { profile: name, vault, vaultDeleted };
    },
    /** Makes `name` the profile the app opens next (a launch with MESA_PROFILE set still wins). */
    use: (name: string) => {
      existing(name);
      setAppProfile(name);
      return { profile: name };
    },
    /** Shows the profile's folder in Finder. */
    open: async (name: string) => {
      const { root } = existing(name);
      const opened = await ctx.run('/usr/bin/open', [root], 5000);
      if (!opened.ok) throw new MesaError('internal', `cannot open ${root}: ${opened.detail}`);
      return { profile: name, dir: root };
    },
  };
}
