// A version's release notes from the change files in changes/, one per user-visible pull request
// (changes/README.md), as a Keep a Changelog section. version.sh puts the section in CHANGELOG.md
// for the bump PR, and publish.sh makes it the GitHub Release's notes (docs/release.md).
//
//   node scripts/release/notes.mjs <version>              print its section
//   node scripts/release/notes.mjs <version> --write      put it in CHANGELOG.md; a stable release
//                                                         then deletes the change files it holds
//   node scripts/release/notes.mjs <version> --published  print CHANGELOG.md's, without its heading
//
// A stable release holds every change file; a beta only those added since the last tag, which it
// keeps, so the stable release after it lists everything.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Each change file type and its group's heading, in the order the section lists them; core's
 * `release/notes.ts` reads this format back (notes.test.ts holds the two together).
 */
const GROUPS = { added: 'Added', changed: 'Changed', fixed: 'Fixed' };
const FRONT_MATTER = /^---\r?\ntype: *(\S+)\r?\n---\r?\n([\s\S]*)$/;

/** A change file's type and its note as one line; throws naming `path` when it is not one. */
export function changeNote(path, text) {
  const [, type, body] = text.match(FRONT_MATTER) ?? [];
  const note = body?.trim().replace(/\s+/g, ' ');
  if (!Object.hasOwn(GROUPS, type ?? '') || !note)
    throw new Error(
      `${path}: not a change file: front matter "type: added", "changed" or "fixed", then the note (changes/README.md)`,
    );
  return { type, note };
}

/** The Markdown lines of `section`'s groups, as `{type, line}`. */
const lines = (section) =>
  section.split(/^(?=### )/m).flatMap((group) => {
    const type = Object.keys(GROUPS).find((t) => group.startsWith(`### ${GROUPS[t]}\n`));
    if (!type) return [];
    return group
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .map((line) => ({ type, line }));
  });

/**
 * The Markdown section for `version` on `date` from its `notes` (`{type, note, pr?}`), after the
 * lines of `kept` (an earlier section of the same version) that it does not repeat.
 */
export function section(version, date, notes, kept = '') {
  const all = [
    ...lines(kept),
    ...notes.map(({ type, note, pr }) => ({ type, line: `- ${note}${pr ? ` (#${pr})` : ''}` })),
  ];
  const body = Object.entries(GROUPS).flatMap(([type, heading]) => {
    const group = [...new Set(all.filter((e) => e.type === type).map((e) => e.line))];
    return group.length ? [`### ${heading}\n\n${group.join('\n')}\n`] : [];
  });
  return [`## ${version} - ${date}\n`, ...body].join('\n');
}

/**
 * `version`'s change files in `dir`, each `{path, type, note, pr?}`: all of them for a stable
 * release, for a beta those added since the tag before its own. `pr` is the number the squash
 * commit that added the file ends with; git runs in `env`.
 */
export function changes(version, dir, env = process.env) {
  const git = (...args) =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    }).trim();
  const folder = join(dir, 'changes');
  const files = existsSync(folder)
    ? readdirSync(folder).filter((f) => f.endsWith('.md') && f !== 'README.md')
    : [];
  let released = [];
  if (version.includes('-')) {
    try {
      const match = ['--match', 'v[0-9]*', '--exclude', `v${version}`];
      const previous = git('describe', '--tags', '--abbrev=0', ...match);
      released = git('ls-tree', '--name-only', previous, 'changes/').split('\n');
    } catch {
      // no earlier tag: every file is new
    }
  }
  return files
    .map((file) => `changes/${file}`)
    .filter((path) => !released.includes(path))
    .sort()
    .map((path) => {
      // The newest commit that added it: a slug a stable release deleted can come back.
      const added = git('log', '-1', '--diff-filter=A', '--format=%s', '--', path);
      const pr = added.match(/\(#(\d+)\)$/)?.[1];
      return { path, ...changeNote(path, readFileSync(join(dir, path), 'utf8')), pr };
    });
}

const versionSection = (version) => (part) => part.startsWith(`## ${version} `);

/** `changelog` with `text` as `version`'s section: in its place when it has one, else first. */
export function withSection(changelog, version, text) {
  const [title, ...parts] = (changelog || '# Changelog\n').split(/^(?=## )/m);
  const at = parts.findIndex(versionSection(version));
  if (at === -1) parts.unshift(text);
  else parts[at] = text;
  return `${[title, ...parts].map((part) => part.trim()).join('\n\n')}\n`;
}

/** `version`'s section in `changelog` without its heading, or '' when it has none. */
export function published(changelog, version) {
  const part = changelog.split(/^(?=## )/m).find(versionSection(version));
  return part ? part.slice(part.indexOf('\n') + 1).trim() : '';
}

/** `dir`'s CHANGELOG.md, or '' when it has none. */
const readChangelog = (dir) => {
  const file = join(dir, 'CHANGELOG.md');
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
};

/**
 * Writes `version`'s section into `dir`'s CHANGELOG.md on `date` and returns it. A stable release
 * deletes the change files it holds and keeps the lines its section already had, so running it
 * again adds what was merged since; a beta keeps its files and writes its section anew.
 */
export function writeNotes(version, dir, date, env = process.env) {
  const changelog = readChangelog(dir);
  const stable = !version.includes('-');
  const found = changes(version, dir, env);
  const text = section(version, date, found, stable ? published(changelog, version) : '');
  writeFileSync(join(dir, 'CHANGELOG.md'), withSection(changelog, version, text));
  if (stable) for (const { path } of found) rmSync(join(dir, path));
  return text;
}

if (import.meta.main) {
  const [version, mode] = process.argv.slice(2);
  if (!version || (mode && mode !== '--write' && mode !== '--published')) {
    console.error('usage: node scripts/release/notes.mjs <version> [--write | --published]');
    process.exit(2);
  }
  const root = join(import.meta.dirname, '..', '..');
  const date = new Date().toISOString().slice(0, 10); // UTC
  try {
    if (mode === '--published') {
      const notes = published(readChangelog(root), version);
      if (notes) console.log(notes);
    } else if (mode === '--write') {
      writeNotes(version, root, date);
      console.log(`CHANGELOG.md has ${version}'s section`);
    } else {
      process.stdout.write(section(version, date, changes(version, root)));
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
