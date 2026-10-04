// A version's release notes from the squash subjects on main, which are typed pull request titles,
// `type(area): summary` (AGENTS.md). version.sh puts the section in CHANGELOG.md for the bump PR,
// and publish.sh makes it the GitHub Release's notes (docs/release.md).
//
//   node scripts/release/notes.mjs <version>              print its section
//   node scripts/release/notes.mjs <version> --write      put it in CHANGELOG.md, replacing an older one
//   node scripts/release/notes.mjs <version> --published  print CHANGELOG.md's, without its heading
//
// A section holds the subjects since the last stable tag, or for a beta since the last tag.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HEADINGS = { feat: 'Features', fix: 'Fixes', perf: 'Performance' };
const ORDER = ['Features', 'Fixes', 'Performance', 'Breaking changes', 'Other'];
const TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore'];
// A typed subject, or a legacy `area: summary` one, whose area then stands where the type does. A
// typed one without a scope outside Features, Fixes and Performance keeps its type as its area,
// since a legacy `docs: ...` reads the same.
const SUBJECT = /^([a-z0-9-]+)(?:\(([a-z0-9-]+)\))?(!)?: (.+)$/;

/** A subject's heading and line, or undefined for a version bump. */
function entry(subject) {
  const match = subject.match(SUBJECT);
  if (!match) return { heading: 'Other', line: `- ${subject}` };
  const [, word, scope, breaking, summary] = match;
  if ((word === 'chore' && scope === 'release') || (word === 'release' && !scope)) return;
  const typed = TYPES.includes(word);
  const area = typed && (scope || HEADINGS[word]) ? scope : word;
  const heading = breaking ? 'Breaking changes' : (typed && HEADINGS[word]) || 'Other';
  return { heading, line: `- ${area ? `**${area}**: ` : ''}${summary}` };
}

/** The Markdown section for `version` on `date` from its squash subjects, newest first. */
export function section(version, date, subjects) {
  const groups = Object.groupBy(subjects.map(entry).filter(Boolean), (e) => e.heading);
  const body = ORDER.filter((heading) => groups[heading]).map(
    (heading) => `### ${heading}\n\n${groups[heading].map((e) => e.line).join('\n')}\n`,
  );
  return [`## ${version} - ${date}\n`, ...body].join('\n');
}

/** The squash subjects in `dir` since the tag before `version`'s, or all of them when none is. */
export function subjects(version, dir) {
  const git = (...args) =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const stable = version.includes('-') ? [] : ['--exclude', '*-*'];
  let previous;
  try {
    const match = ['--match', 'v[0-9]*', ...stable, '--exclude', `v${version}`];
    previous = git('describe', '--tags', '--abbrev=0', ...match);
  } catch {
    previous = undefined; // no earlier tag: the whole history
  }
  const log = git('log', '--format=%s', previous ? `${previous}..HEAD` : 'HEAD');
  return log ? log.split('\n') : [];
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

if (import.meta.main) {
  const [version, mode] = process.argv.slice(2);
  if (!version || (mode && mode !== '--write' && mode !== '--published')) {
    console.error('usage: node scripts/release/notes.mjs <version> [--write | --published]');
    process.exit(2);
  }
  const root = join(import.meta.dirname, '..', '..');
  const file = join(root, 'CHANGELOG.md');
  const changelog = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (mode === '--published') {
    const notes = published(changelog, version);
    if (notes) console.log(notes);
  } else {
    const date = new Date().toISOString().slice(0, 10); // UTC
    const text = section(version, date, subjects(version, root));
    if (mode === '--write') {
      writeFileSync(file, withSection(changelog, version, text));
      console.log(`CHANGELOG.md has ${version}'s section`);
    } else {
      process.stdout.write(text);
    }
  }
}
