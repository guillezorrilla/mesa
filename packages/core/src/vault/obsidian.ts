import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { vaultFile } from './scope.js';

/** Where Obsidian keeps its pieces. Injected so tests point at a temp dir instead of the Mac's. */
export type ObsidianPaths = {
  /** The CLI, when "Command line interface" is on in Obsidian's settings. */
  registered: string;
  /** The CLI binary inside the app, present even when not registered. */
  bundle: string;
  /** The app's Info.plist: the installer version, read without launching the app. */
  plist: string;
  /** Obsidian's own vault list, read (never written) to know whether it can open a vault. */
  vaultList: string;
};

/** The real paths on macOS for a user whose home directory is `home`. */
export const macObsidianPaths = (home: string): ObsidianPaths => ({
  registered: '/usr/local/bin/obsidian',
  bundle: '/Applications/Obsidian.app/Contents/MacOS/obsidian-cli',
  plist: '/Applications/Obsidian.app/Contents/Info.plist',
  vaultList: join(home, 'Library/Application Support/obsidian/obsidian.json'),
});

const OPEN_TIMEOUT_MS = 5000;

/**
 * `obsidian://open` for the vault, or one note in it (docs/spikes/obsidian-cli.md). Obsidian names a
 * vault after its folder; every value is URI-encoded.
 */
export function obsidianUri(vault: string, note?: string): string {
  const name = `vault=${encodeURIComponent(basename(vault))}`;
  return `obsidian://open?${name}${note === undefined ? '' : `&file=${encodeURIComponent(note)}`}`;
}

/** Obsidian's known vault folders, from its own list. Read only; a missing or odd list means none. */
function knownVaults(vaultList: string): string[] {
  try {
    const list = JSON.parse(readFileSync(vaultList, 'utf8')) as {
      vaults?: Record<string, { path?: string }>;
    };
    return Object.values(list.vaults ?? {}).flatMap((v) => (v.path ? [resolve(v.path)] : []));
  } catch {
    return [];
  }
}

export type Opened = { opened: true; method: 'uri' | 'cli'; target: string };

/**
 * Opens the vault, or one note in it (a vault-relative path; `.md` may be left out), in Obsidian.
 * The default is the `obsidian://` URI through macOS `open`, which launches Obsidian when needed.
 * `cli` uses the Obsidian CLI for a note when it is registered, and falls back to the URI when the
 * app is closed, since the CLI cannot launch it.
 */
export async function openInObsidian(
  deps: { run: Runner; obsidian: ObsidianPaths },
  opts: { vault: string; note?: string; cli?: boolean },
): Promise<Opened> {
  const { vault } = opts;
  if (!statSync(vault, { throwIfNoEntry: false })?.isDirectory()) {
    throw new MesaError('invalid_config', `vault ${vault} does not exist; run mesa vault init`);
  }
  const note =
    opts.note === undefined ? undefined : extname(opts.note) ? opts.note : `${opts.note}.md`;
  if (
    note !== undefined &&
    !statSync(vaultFile(vault, note), { throwIfNoEntry: false })?.isFile()
  ) {
    throw new MesaError('not_found', `no note at ${note} in ${vault}`);
  }
  // Opening an unknown vault shows Obsidian's "Vault not found" dialog; say how to fix it instead.
  const known = knownVaults(deps.obsidian.vaultList);
  if (!known.includes(resolve(vault))) {
    throw new MesaError(
      'not_found',
      `Obsidian does not know the vault ${vault} yet: open it once with "Open folder as vault" in Obsidian, then retry`,
    );
  }
  // Obsidian names a vault by its folder, so a second known vault with the same folder name makes
  // `vault=` ambiguous: refuse rather than open the wrong one.
  const namesakes = known.filter((path) => basename(path) === basename(vault));
  if (namesakes.length > 1) {
    throw new MesaError(
      'invalid_config',
      `Obsidian knows ${namesakes.length} vaults named ${basename(vault)} (${namesakes.join(', ')}); rename one folder so the name is unique`,
    );
  }
  if (opts.cli && note !== undefined && existsSync(deps.obsidian.registered)) {
    const args = [`vault=${basename(vault)}`, 'open', `path=${note}`];
    const cli = await deps.run(deps.obsidian.registered, args, OPEN_TIMEOUT_MS);
    if (cli.ok) return { opened: true, method: 'cli', target: note };
  }
  const uri = obsidianUri(vault, note);
  const opened = await deps.run('open', [uri], OPEN_TIMEOUT_MS);
  if (!opened.ok) throw new MesaError('internal', `could not open ${uri}: ${opened.detail}`);
  return { opened: true, method: 'uri', target: uri };
}
