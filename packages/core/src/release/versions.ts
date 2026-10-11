import { compare, gt, lte, prerelease, valid } from 'semver';
import type { ReleaseNotes } from './notes.js';

/**
 * The versions among `notes` that `running` adds over `seen`, the newest version run before,
 * oldest first: none when `seen` is unknown (a fresh profile), and undefined when `running` is not
 * newer, so nothing changes. A stable Mesa skips betas, whose notes its own section repeats.
 */
export function versionsSince(
  notes: ReleaseNotes[],
  seen: string | undefined,
  running: string,
): string[] | undefined {
  if (!seen || !valid(seen)) return [];
  if (!valid(running) || !gt(running, seen)) return undefined;
  return notes
    .map((section) => section.version)
    .filter(
      (v) => valid(v) && gt(v, seen) && lte(v, running) && (prerelease(running) || !prerelease(v)),
    )
    .sort(compare);
}
