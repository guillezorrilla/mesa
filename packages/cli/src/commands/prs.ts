import { BUCKET_LABELS, type PrDraft } from '@mesa/core';
import { defineCommand } from '../command.js';
import { wholeNumber } from '../input/flags.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

const where = (d: { path: string | null; line: number | null }) =>
  d.path ? `${d.path}${d.line ? `:${d.line}` : ''}` : 'summary';
const draftLines = (drafts: PrDraft[]) =>
  drafts.length
    ? columns(drafts.map((d) => [d.id, where(d), d.body.split('\n')[0]]))
    : ['No pending drafts.'];

export const prsShow = defineCommand({
  name: 'prs show',
  summary:
    "Show one pull request: where it stands for you, your threads with the author's last reply, your pending drafts, and its files",
  args: ['project', 'number'],
  example: 'mesa prs show lantern-cove 482',
  run: async ({ mesa, args }) => {
    const data = await mesa.prs.show(args.project, wholeNumber(args.number, 'number'));
    return {
      data,
      text: [
        `#${data.number} ${data.title} (${BUCKET_LABELS[data.bucket as keyof typeof BUCKET_LABELS] ?? data.bucket})`,
        `${data.author} · ${data.branch} -> ${data.base} · +${data.additions} -${data.deletions} · checks ${data.checks ?? 'none'}`,
        data.url,
        '',
        'Your threads:',
        ...(data.threads.length
          ? data.threads.map(
              (t) =>
                `  ${t.resolved ? 'resolved' : 'open'}  ${where(t)}  ${t.body.split('\n')[0]}${t.lastReply ? `\n    ${t.lastReply.author}: ${t.lastReply.body.split('\n')[0]}` : ''}`,
            )
          : ['  none']),
        '',
        'Pending drafts:',
        ...draftLines(data.drafts).map((l) => `  ${l}`),
        '',
        'Files:',
        ...columns(
          data.files.map((f) => [`+${f.additions}`, `-${f.deletions}`, f.path]),
          '  ',
        ),
      ].join('\n'),
    };
  },
});

export const prsDraft = defineCommand({
  name: 'prs draft',
  summary:
    'Leave one pending draft comment on a pull request, seen only by you until you submit the review on GitHub or Bitbucket; Mesa never submits',
  args: ['project', 'number'],
  flags: {
    text: { type: 'string', required: true, description: 'The comment' },
    path: { type: 'string', description: 'Inline: the file, with --line' },
    line: { type: 'string', description: 'Inline: the line in the new version, with --path' },
    'reply-to': { type: 'string', description: 'Reply in this thread (an id from mesa prs show)' },
  },
  example: 'mesa prs draft lantern-cove 482 --path src/cart.ts --line 57 --text "Round once"',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.prs.draft(args.project, wholeNumber(args.number, 'number'), {
      text: flags.text,
      ...(flags.path ? { path: flags.path } : {}),
      ...(flags.line ? { line: wholeNumber(flags.line, '--line') } : {}),
      ...(flags['reply-to'] ? { replyTo: flags['reply-to'] } : {}),
    });
    const d = recorded.result;
    return recordedOutput(recorded, {
      data: d,
      text: `Drafted ${d.id} at ${where(d)} (pending; submit it on the provider)`,
    });
  },
});

export const prsDrafts = defineCommand({
  name: 'prs drafts',
  summary: 'List your pending draft comments on a pull request',
  args: ['project', 'number'],
  example: 'mesa prs drafts lantern-cove 482',
  run: async ({ mesa, args }) => {
    const data = await mesa.prs.drafts(args.project, wholeNumber(args.number, 'number'));
    return { data, text: draftLines(data).join('\n') };
  },
});

export const prsDiscard = defineCommand({
  name: 'prs discard',
  summary: 'Delete one of your pending draft comments on a pull request',
  args: ['project', 'number', 'id'],
  example: 'mesa prs discard lantern-cove 482 PRRC_kwDOA1',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.prs.discard(
      args.project,
      wholeNumber(args.number, 'number'),
      args.id,
    );
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `Discarded ${recorded.result.id}`,
    });
  },
});

export const prs = defineCommand({
  name: 'prs',
  summary:
    'List the open pull requests that need you across projects (GitHub through gh, Bitbucket through twg), most urgent first',
  flags: {
    project: { type: 'string', description: 'Only this project' },
    all: { type: 'boolean', description: 'Also list open PRs that are not for you' },
  },
  example: 'mesa prs --project lantern-cove',
  run: async ({ mesa, flags }) => {
    const data = await mesa.prs.list({
      ...(flags.project ? { project: flags.project } : {}),
      ...(flags.all ? { all: true } : {}),
    });
    const rows = columns(
      data.prs.map((p) => [
        p.project,
        `#${p.number}`,
        BUCKET_LABELS[p.bucket],
        p.author,
        p.bucket === 'updated'
          ? `${p.since.commits} commits, ${p.since.replies} replies, ${p.since.resolved}/${p.since.threads} resolved`
          : '',
        p.title,
      ]),
    );
    return {
      data,
      text: [
        ...(rows.length ? rows : ['No pull requests need you.']),
        ...data.blocked.map(
          (b) => `${b.project}: ${b.cli} ${b.state}${b.next ? `; run ${b.next}` : ''}`,
        ),
        ...data.problems.map((p) => `${p.project}: ${p.reason}`),
      ].join('\n'),
    };
  },
});

export const prsSetup = defineCommand({
  name: 'prs setup',
  summary:
    "Show each project's PR provider (GitHub or Bitbucket) and whether its CLI (gh, twg) is ready",
  flags: { project: { type: 'string', description: 'Only this project' } },
  example: 'mesa prs setup --project lantern-cove',
  run: async ({ mesa, flags }) => {
    const data = await mesa.prs.setup(flags.project);
    return {
      data,
      text: columns(
        data.map((r) => [r.project, r.provider ?? 'no PR provider', r.cli, r.state, r.next]),
      ).join('\n'),
    };
  },
});
