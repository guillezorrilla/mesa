import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  linkSync,
  lstatSync,
  openSync,
  readSync,
  unlinkSync,
} from 'node:fs';
import { createFileAtomic, writeFileAtomic } from '../lib/atomic-file.js';
import { MesaError } from '../lib/result.js';
import type { Checkout } from '../projects/checkout.js';
import { checkedFilePath } from './path.js';

const MAX_TEXT = 64 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });

export type WorkspaceFile = {
  checkout: Checkout;
  path: string;
  text: string;
  revision: string;
  lines: number;
  targetLine?: number;
};
export type FileChange = {
  checkout: Checkout;
  path: string;
  revision?: string;
  action: 'write' | 'create' | 'rename' | 'delete';
  from?: string;
};

function textOf(bytes: Buffer, path: string): string {
  if (bytes.length > MAX_TEXT)
    throw new MesaError('usage', `${path} exceeds the 64 KiB editor limit`);
  if (bytes.includes(0)) throw new MesaError('usage', `${path} is binary`);
  try {
    return decoder.decode(bytes);
  } catch {
    throw new MesaError('usage', `${path} is not UTF-8 text`);
  }
}

export function readWorkspaceFile(
  checkout: Checkout,
  path: string,
  targetLine?: number,
): WorkspaceFile {
  const target = checkedFilePath(checkout.path, path);
  let fd: number;
  try {
    fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new MesaError('usage', `file ${path} crosses a symlink`);
    }
    throw error;
  }
  let bytes: Buffer;
  try {
    if (!fstatSync(fd).isFile()) throw new MesaError('usage', `${path} is not a regular file`);
    const buffer = Buffer.alloc(MAX_TEXT + 1);
    let used = 0;
    while (used < buffer.length) {
      const read = readSync(fd, buffer, used, buffer.length - used, null);
      if (!read) break;
      used += read;
    }
    bytes = buffer.subarray(0, used);
  } finally {
    closeSync(fd);
  }
  const text = textOf(bytes, path);
  const lines = text.split('\n').length;
  if (
    targetLine !== undefined &&
    (!Number.isSafeInteger(targetLine) || targetLine < 1 || targetLine > lines)
  ) {
    throw new MesaError('usage', `line must be between 1 and ${lines}`);
  }
  return {
    checkout,
    path,
    text,
    revision: createHash('sha256').update(bytes).digest('hex'),
    lines,
    ...(targetLine ? { targetLine } : {}),
  };
}

function checkRevision(checkout: Checkout, path: string, expected: string): WorkspaceFile {
  if (!/^[0-9a-f]{64}$/.test(expected))
    throw new MesaError('usage', 'expected revision must be a SHA-256 hex digest');
  const current = readWorkspaceFile(checkout, path);
  if (current.revision !== expected) {
    throw new MesaError('locked', `${path} changed outside Mesa; reload before editing`, {
      revision: current.revision,
    });
  }
  return current;
}

function checkedText(text: string): void {
  if (Buffer.byteLength(text) > MAX_TEXT || text.includes('\0')) {
    throw new MesaError('usage', 'editor text must be UTF-8 without NUL and at most 64 KiB');
  }
}

export function writeWorkspaceFile(
  checkout: Checkout,
  path: string,
  text: string,
  expected: string,
): FileChange {
  checkedText(text);
  checkRevision(checkout, path, expected);
  const target = checkedFilePath(checkout.path, path);
  const mode = lstatSync(target).mode;
  checkRevision(checkout, path, expected);
  writeFileAtomic(target, text, mode);
  return { checkout, path, revision: readWorkspaceFile(checkout, path).revision, action: 'write' };
}

export function createWorkspaceFile(checkout: Checkout, path: string, text = ''): FileChange {
  checkedText(text);
  const target = checkedFilePath(checkout.path, path, true);
  if (!createFileAtomic(target, text)) throw new MesaError('usage', `file ${path} already exists`);
  return { checkout, path, revision: readWorkspaceFile(checkout, path).revision, action: 'create' };
}

export function renameWorkspaceFile(
  checkout: Checkout,
  from: string,
  path: string,
  expected: string,
): FileChange {
  checkRevision(checkout, from, expected);
  const source = checkedFilePath(checkout.path, from);
  const target = checkedFilePath(checkout.path, path, true);
  checkRevision(checkout, from, expected);
  // A destination appearing concurrently must survive: renameSync would overwrite it.
  try {
    linkSync(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new MesaError('usage', `file ${path} already exists`);
    throw error;
  }
  unlinkSync(source);
  return {
    checkout,
    path,
    from,
    revision: readWorkspaceFile(checkout, path).revision,
    action: 'rename',
  };
}

export function deleteWorkspaceFile(
  checkout: Checkout,
  path: string,
  expected: string,
): FileChange {
  const target = checkedFilePath(checkout.path, path);
  checkRevision(checkout, path, expected);
  unlinkSync(target);
  return { checkout, path, action: 'delete' };
}
