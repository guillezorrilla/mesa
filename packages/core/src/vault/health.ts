import { readFileSync } from 'node:fs';
import { parseNote } from './frontmatter.js';
import { listVault } from './inventory.js';
import type { VaultItem } from './item.js';
import { projectHubPath } from './layout.js';
import { linkIndex, resolveLinks } from './links.js';
import { vaultFile } from './scope.js';

export type VaultHealthKind =
  | 'broken-link'
  | 'ambiguous-link'
  | 'orphan-note'
  | 'missing-project'
  | 'invalid-frontmatter'
  | 'stale-index'
  | 'unavailable-item';

export type VaultHealthFinding = {
  kind: VaultHealthKind;
  path: string;
  line?: number;
  column?: number;
  target?: string;
  candidates?: string[];
  message: string;
};

export type VaultHealth = {
  vault: string;
  checked: number;
  findings: VaultHealthFinding[];
  limitations: string[];
};

/** Knowledge notes and the catalog; immutable inputs and operational history stay out. */
const knowledge = (item: VaultItem) =>
  item.kind === 'markdown' && ['wiki', 'projects', 'user', 'index'].includes(item.category);

/**
 * A read-only snapshot of navigation and project-discovery gaps, over the inventory and the
 * reader's link resolver. Orphans and unassigned notes are advisory, not inferred intent.
 */
export function vaultHealth(vault: string): VaultHealth {
  const items = listVault(vault);
  const index = linkIndex(items.map((item) => item.path));
  const findings: VaultHealthFinding[] = [];
  const incoming = new Set<string>();
  const notes: VaultItem[] = [];
  let checked = 0;
  for (const item of items) {
    if (item.unavailable) {
      findings.push({
        kind: 'unavailable-item',
        path: item.path,
        message: `Item is ${item.unavailable}; its contents were not checked.`,
      });
      continue;
    }
    if (!knowledge(item)) continue;
    let text: string;
    try {
      text = readFileSync(vaultFile(vault, item.path), 'utf8');
    } catch {
      findings.push({
        kind: 'unavailable-item',
        path: item.path,
        message: 'Item could not be read in vault scope; its contents were not checked.',
      });
      continue;
    }
    checked++;
    let note: ReturnType<typeof parseNote>;
    try {
      note = parseNote(text);
      if (
        !note.frontmatter ||
        typeof note.frontmatter !== 'object' ||
        Array.isArray(note.frontmatter) ||
        (/^---\r?\n/.test(text) && note.body === text)
      )
        throw new Error('invalid frontmatter');
    } catch {
      findings.push({
        kind: 'invalid-frontmatter',
        path: item.path,
        line: 1,
        message: 'Frontmatter must be a YAML mapping between complete --- fences.',
      });
      continue;
    }
    if (item.category !== 'index') notes.push(item);
    if (item.category === 'wiki' && !item.project?.trim()) {
      findings.push({
        kind: 'missing-project',
        path: item.path,
        message:
          'No project association; project context omits this note. This may be intentional for shared knowledge.',
      });
    }
    const offset = text.slice(0, text.length - note.body.length).split('\n').length - 1;
    for (const link of resolveLinks(index, item.path, note.body)) {
      if (link.status === 'resolved') {
        if (link.path !== item.path) incoming.add(link.path);
        continue;
      }
      const line = offset + note.body.slice(0, link.start).split('\n').length;
      const column = link.start - note.body.lastIndexOf('\n', link.start - 1);
      if (link.status === 'ambiguous') {
        findings.push({
          kind: 'ambiguous-link',
          path: item.path,
          line,
          column,
          target: link.target,
          candidates: link.candidates,
          message: `Link ${link.text} has multiple targets: ${link.candidates.join(', ')}.`,
        });
      } else {
        findings.push({
          kind: item.category === 'index' ? 'stale-index' : 'broken-link',
          path: item.path,
          line,
          column,
          target: link.target,
          message: `Link ${link.text} has no target in the vault inventory.`,
        });
      }
    }
  }
  for (const item of notes) {
    // Project hubs are entry points, so they need not have an incoming link.
    if (incoming.has(item.path) || (item.project && item.path === projectHubPath(item.project)))
      continue;
    findings.push({
      kind: 'orphan-note',
      path: item.path,
      message: 'No incoming link from another knowledge note or index. This may be intentional.',
    });
  }
  findings.sort(
    (a, b) =>
      a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0) || a.kind.localeCompare(b.kind),
  );
  return {
    vault,
    checked,
    findings,
    limitations: [
      'Checks Markdown knowledge notes and index.md; raw inputs, receipts, daily notes and layout instructions are excluded.',
      'Link targets are checked at file level; heading and block fragments, Canvas and Bases contents are not checked.',
      'Semantic contradictions, evidence quality and factual freshness are not checked. Findings are advisory; no files are changed.',
    ],
  };
}
