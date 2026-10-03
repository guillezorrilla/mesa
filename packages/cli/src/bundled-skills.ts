import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** An executable's assets: node:sea's getAssetKeys and getAsset. */
export type Assets = { keys: () => string[]; get: (key: string) => ArrayBuffer };

const MARK = '.version';

/**
 * The skill library the app's single executable carries (its `skills/` assets, ADR-0017) as the
 * folder `dir`, which projects link into. It is rewritten whole when `version` differs, so the
 * links survive an update and a skill the new version dropped is gone.
 */
export function unpackSkills(dir: string, version: string, assets: Assets): string {
  const current = () => {
    try {
      return readFileSync(join(dir, MARK), 'utf8');
    } catch {
      return undefined;
    }
  };
  if (current() === version) return dir;
  mkdirSync(dirname(dir), { recursive: true });
  const stage = mkdtempSync(`${dir}-`);
  for (const key of assets.keys().filter((k) => k.startsWith('skills/'))) {
    const file = join(stage, key.slice('skills/'.length));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, new Uint8Array(assets.get(key)));
  }
  writeFileSync(join(stage, MARK), version);
  rmSync(dir, { recursive: true, force: true });
  try {
    renameSync(stage, dir);
  } catch (error) {
    // Another mesa unpacked the same version first.
    rmSync(stage, { recursive: true, force: true });
    if (current() !== version) throw error;
  }
  return dir;
}
