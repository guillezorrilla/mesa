import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { basename } from 'node:path';
import { MesaError } from '../../lib/result.js';
import type { SessionStore } from '../record/store.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type SessionImage = {
  profile: string;
  session: string;
  path: string;
  name: string;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: number;
  revision: string;
  dataUrl: string;
};

function readImage(path: string) {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ELOOP') throw new MesaError('usage', 'image must not be a symlink');
    if (code === 'ENOENT') throw new MesaError('not_found', 'selected image no longer exists');
    if (code === 'EACCES') throw new MesaError('usage', 'selected image cannot be read');
    throw error;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new MesaError('usage', 'image must be a regular file');
    if (stat.size > MAX_IMAGE_BYTES) throw new MesaError('usage', 'image exceeds the 5 MiB limit');
    const buffer = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      const count = readSync(fd, buffer, used, buffer.length - used, null);
      if (!count) break;
      used += count;
    }
    if (used > MAX_IMAGE_BYTES) throw new MesaError('usage', 'image exceeds the 5 MiB limit');
    const bytes = buffer.subarray(0, used);
    const mime: SessionImage['mime'] | null = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'image/png'
      : bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        ? 'image/jpeg'
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
          ? 'image/webp'
          : null;
    if (!mime) throw new MesaError('usage', 'choose a PNG, JPEG, or WebP image');
    return { bytes, mime, revision: createHash('sha256').update(bytes).digest('hex') };
  } finally {
    closeSync(fd);
  }
}

/** A volatile image selection: no copy is made, so cancelling leaves nothing to clean up. */
export function previewSessionImage(
  deps: { profile: string; store: SessionStore; absolute: (path: string) => string },
  id: string,
  path: string,
): SessionImage {
  const session = deps.store.get(id);
  if (session.agent !== 'claude' || session.kind !== 'interactive' || session.endedAt)
    throw new MesaError('usage', 'image delivery requires a live Claude Code session');
  const resolved = deps.absolute(path);
  const image = readImage(resolved);
  return {
    profile: deps.profile,
    session: id,
    path: resolved,
    name: basename(resolved),
    mime: image.mime,
    bytes: image.bytes.length,
    revision: image.revision,
    dataUrl: `data:${image.mime};base64,${image.bytes.toString('base64')}`,
  };
}

/** Recheck the selected file just before the existing guarded send types a provider-native path. */
export function sessionImagePrompt(
  deps: { profile: string; store: SessionStore; absolute: (path: string) => string },
  id: string,
  path: string,
  revision: string,
  expectedProfile: string,
  note = '',
): string {
  if (deps.profile !== expectedProfile)
    throw new MesaError('usage', 'the selected image belongs to another Mesa profile');
  const image = previewSessionImage(deps, id, path);
  if (image.revision !== revision)
    throw new MesaError('locked', 'the selected image changed; preview it again');
  return `${note.trim() ? `${note.trim()}\n\n` : ''}Read this image as visual input: ${JSON.stringify(image.path)}`;
}
