import { MesaError } from '../../lib/result.js';
import type { ChangesCall } from '../protocol/changes.js';
import type { CallResult } from '../protocol/rpc.js';
import { patchFiles, patchPage } from './patch-files.js';

/** The core functions the change calls go through, the ones `mesa diff`, `review`, `git` and `files` use. */
export type ChangesDeps = {
  /** The session's diff against its base (`mesa diff`); `reuse` takes a read kept from just before. */
  diff: (
    id: string,
    reuse?: boolean,
  ) => Promise<{ base: string; branch: string | null; omitted: number; patch: string }>;
  /** The project and checkout the session works in. */
  where: (id: string) => { project: string; checkout?: string };
  /** Keeps a note on a file's lines, then sends that file's notes (`review notes add`, `send`). */
  note: (
    id: string,
    input: { path: string; line: number; end: number; text: string },
  ) => Promise<{ delivery?: Delivery }>;
  /** The session's replies, to find a quoted one's source (`review responses`). */
  replies: (id: string) => {
    rows: { profile: string; source: string; revision: string; text: string }[];
  };
  /** Sends a comment on a reply's passage through the guardrail (`review send`). */
  quote: (
    id: string,
    input: {
      profile: string;
      source: string;
      revision: string;
      start: number;
      end: number;
      comment: string;
    },
  ) => Promise<Delivery>;
  git: {
    status: (
      project: string,
      checkout?: string,
    ) => Promise<{
      branch: string | null;
      changes: { path: string; index: string; workingTree: string }[];
    }>;
    stage: (project: string, path: string, checkout?: string) => Promise<unknown>;
    unstage: (project: string, path: string, checkout?: string) => Promise<unknown>;
    message: (project: string, opts: { checkout?: string }) => Promise<{ message: string }>;
    commit: (
      project: string,
      message: string,
      checkout?: string,
    ) => Promise<{ result: { oid: string } }>;
    push: (project: string, checkout?: string) => Promise<Synced>;
    pull: (project: string, checkout?: string) => Promise<Synced>;
    branches: (
      project: string,
      checkout?: string,
    ) => Promise<{ branches: { name: string; current: boolean; checkedOutAt?: string }[] }>;
    branchCheckout: (project: string, name: string, checkout?: string) => Promise<unknown>;
  };
  files: {
    tree: (
      project: string,
      checkout?: string,
    ) => Promise<{ entries: { path: string; kind: 'directory' | 'file' }[]; truncated: boolean }>;
    search: (
      project: string,
      query: string,
      mode: 'name' | 'content',
      checkout?: string,
    ) => Promise<{ hits: { path: string; line: number; preview: string }[] }>;
    read: (project: string, path: string, checkout?: string) => Promise<{ text: string }>;
    image: (
      project: string,
      path: string,
      checkout?: string,
    ) => Promise<{ mime: string; bytes: Buffer }>;
  };
};

type Delivery = { status: string; reason?: string };
type Synced = { result: { remote: string; upstream: string } };

/** The largest image the phone is sent: its base64 stays well inside one call's 600 KB. */
const IMAGE_BYTES = 400 * 1024;
const IMAGE = /\.(png|jpe?g|webp)$/i;

const delivered = (delivery: Delivery | undefined): Delivery =>
  delivery
    ? { status: delivery.status, ...(delivery.reason ? { reason: delivery.reason } : {}) }
    : { status: 'delivered' };

/** Answers a call about a session's changes, its source control or its files. */
export async function answerChanges(deps: ChangesDeps, call: ChangesCall): Promise<unknown> {
  const { id } = call;
  if (call.method === 'changes') {
    const { base, branch, omitted, patch } = await deps.diff(id);
    const files = patchFiles(patch).map(({ lines: _, ...file }) => file);
    return { base, branch, omitted, files } satisfies CallResult<'changes'>;
  }
  if (call.method === 'diff') {
    const file = patchFiles((await deps.diff(id, true)).patch).find((f) => f.path === call.path);
    if (!file) throw new MesaError('not_found', `${call.path} has no changes now`);
    return patchPage(file.lines, call.from) satisfies CallResult<'diff'>;
  }
  if (call.method === 'note') {
    const { path, line, end, text } = call;
    return delivered((await deps.note(id, { path, line, end, text })).delivery);
  }
  if (call.method === 'quote') {
    const reply = deps.replies(id).rows.find((row) => row.revision === call.revision);
    const start = reply?.text.indexOf(call.passage) ?? -1;
    if (!reply || start < 0) throw new MesaError('not_found', 'that reply changed; read it again');
    const { profile, source, revision } = reply;
    const end = start + call.passage.length;
    return delivered(
      await deps.quote(id, { profile, source, revision, start, end, comment: call.comment }),
    );
  }
  const { project, checkout } = deps.where(id);
  const { git, files } = deps;
  switch (call.method) {
    case 'status': {
      const { branch, changes } = await git.status(project, checkout);
      return {
        branch,
        files: changes.map(({ path, index, workingTree }) => ({ path, index, workingTree })),
      } satisfies CallResult<'status'>;
    }
    case 'stage':
      await (call.staged ? git.stage : git.unstage)(project, call.path, checkout);
      return {};
    case 'message':
      return { message: (await git.message(project, { checkout })).message };
    case 'commit':
      return { oid: (await git.commit(project, call.message, checkout)).result.oid };
    case 'sync': {
      const { remote, upstream } = (await git[call.action](project, checkout)).result;
      return { remote, upstream };
    }
    case 'branches': {
      const { branches } = await git.branches(project, checkout);
      return {
        current: branches.find((branch) => branch.current)?.name ?? null,
        // A branch checked out in another worktree cannot be switched to here.
        names: branches.filter((b) => b.current || !b.checkedOutAt).map((b) => b.name),
      } satisfies CallResult<'branches'>;
    }
    case 'switch':
      await git.branchCheckout(project, call.name, checkout);
      return {};
    case 'files': {
      const { entries, truncated } = await files.tree(project, checkout);
      return {
        entries: entries.map((entry) => ({ path: entry.path, dir: entry.kind === 'directory' })),
        truncated,
      } satisfies CallResult<'files'>;
    }
    case 'search': {
      const { hits } = await files.search(project, call.query, call.mode, checkout);
      return { hits: hits.map(({ path, line, preview }) => ({ path, line, preview })) };
    }
    case 'file': {
      if (!IMAGE.test(call.path))
        return { kind: 'text', text: (await files.read(project, call.path, checkout)).text };
      const { mime, bytes } = await files.image(project, call.path, checkout);
      if (bytes.length > IMAGE_BYTES)
        throw new MesaError('usage', `${call.path} is over 400 KB, too large for the phone`);
      return { kind: 'image', mime, data: bytes.toString('base64') } satisfies CallResult<'file'>;
    }
  }
}
