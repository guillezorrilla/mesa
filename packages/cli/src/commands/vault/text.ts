import { type ProjectContext, projectLabel, type SessionGoal, type VaultRead } from '@mesa/core';
import { columns } from '../../output/columns.js';

// What the vault commands print without --json.

/** What `mesa vault read` prints without --json: the preview, then the links and backlinks. */
export function readText(read: VaultRead): string {
  const lines = [`${read.path} (${read.kind})`];
  if (read.preview === 'markdown') {
    const properties = Object.entries(read.frontmatter).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]);
    lines.push(...columns(properties), '', read.body.trimEnd(), '');
    lines.push(read.links.length ? 'links:' : 'links: none');
    lines.push(
      ...columns(
        read.links.map((link) => [
          link.status,
          link.text,
          link.status === 'resolved'
            ? link.path
            : link.status === 'ambiguous'
              ? link.candidates.join(', ')
              : '',
        ]),
        '  ',
      ),
    );
  } else if (read.preview === 'canvas') {
    lines.push(`${read.nodes} nodes, ${read.edges} edges`, ...read.texts.map((t) => `- ${t}`));
  } else if (read.preview === 'base') {
    if (read.views) lines.push(`views: ${read.views.join(', ')}`);
    lines.push(read.yaml.trimEnd());
  } else {
    lines.push(`preview not available: ${read.reason}`);
  }
  lines.push(read.backlinks.length ? 'backlinks:' : 'backlinks: none');
  lines.push(...read.backlinks.map((path) => `  ${path}`), `open: ${read.uri}`);
  return lines.join('\n');
}

/** A heading and its rows, or the heading saying there are none. */
const section = (title: string, rows: string[][]) =>
  rows.length ? [`${title}:`, ...columns(rows, '  ')] : [`${title}: none`];

export const goalRow = (g: SessionGoal) => [
  g.id,
  g.agent,
  g.started,
  g.goal?.split('\n', 1)[0] ?? '-',
  g.summary ?? '',
];

/** What `mesa vault context` prints without --json. */
export function contextText(context: ProjectContext): string {
  const { hub, counts } = context;
  return [
    projectLabel(context.project),
    ...(hub ? [`hub: ${hub.path}`, '', hub.excerpt, ''] : ['hub: none']),
    ...(counts
      ? [
          `items: ${Object.entries(counts)
            .map(([category, n]) => `${category} ${n}`)
            .join(', ')}`,
        ]
      : []),
    ...section(
      'index',
      context.index.map((line) => [line]),
    ),
    ...section(
      'notes',
      context.notes.map((n) => [n.modified, n.path, n.title]),
    ),
    ...section(
      'decisions',
      context.decisions.map((d) => [d.when, d.path, d.title]),
    ),
    ...section('goals', context.goals.map(goalRow)),
    context.more,
  ].join('\n');
}
