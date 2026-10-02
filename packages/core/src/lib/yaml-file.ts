import { readFileSync, statSync } from 'node:fs';
import { isMap, parseDocument, stringify } from 'yaml';
import type { z } from 'zod';
import { createFileAtomic, writeFileAtomic } from './atomic-file.js';
import { MesaError } from './result.js';
import { parseWith } from './schema.js';

// Position only: the parser's own message quotes source lines, which may hold a key value.
function readDocument(file: string) {
  const doc = parseDocument(readFileSync(file, 'utf8'));
  const pos = doc.errors[0]?.linePos?.[0];
  if (doc.errors.length) {
    const at = pos ? ` at line ${pos.line}, column ${pos.col}` : '';
    throw new MesaError('invalid_config', `${file}: not valid YAML${at}`);
  }
  return doc;
}

/** Reads and validates a YAML file. The caller checks that it exists. */
export function readYaml<T>(file: string, schema: z.ZodType<T>): T {
  return parseWith(schema, readDocument(file).toJS(), file);
}

/**
 * Writes `data` as YAML under an optional header comment. With `exclusive` an existing file is
 * never replaced, and the result is false instead.
 */
export function writeYaml(
  file: string,
  data: unknown,
  opts: { header?: string; mode?: number; exclusive?: boolean } = {},
): boolean {
  const doc = parseDocument(stringify(data));
  if (opts.header) doc.commentBefore = ` ${opts.header}`;
  if (opts.exclusive) return createFileAtomic(file, doc.toString(), opts.mode);
  writeFileAtomic(file, doc.toString(), opts.mode);
  return true;
}

/** The value at a dotted path (`worktrees.fetch`) in parsed data; undefined when it has none. */
export const valueAt = (data: unknown, dotted: string): unknown =>
  dotted.split('.').reduce<unknown>((node, k) => (node as Record<string, unknown>)?.[k], data);

/**
 * Sets one dotted path, or removes it when `value` is undefined, keeping comments and the order of
 * the other keys. The file is rewritten only when the result validates.
 */
export function setYamlPath<T>(
  file: string,
  schema: z.ZodType<T>,
  dotted: string,
  value: unknown,
  /** Throws to refuse the validated result, before anything is written. */
  check?: (next: T) => void,
): T {
  const doc = readDocument(file);
  const keys = dotted.split('.');
  if (value === undefined) {
    if (doc.hasIn(keys)) doc.deleteIn(keys);
    // A map the removal leaves empty goes too, so no `worktrees: {}` stays behind.
    for (let depth = keys.length - 1; depth > 0; depth--) {
      const parent = doc.getIn(keys.slice(0, depth), true);
      if (!isMap(parent) || parent.items.length) break;
      doc.deleteIn(keys.slice(0, depth));
    }
  } else {
    doc.setIn(keys, value);
    // A map written as `{}` stays a flow map when it gains entries; write it as a block instead.
    const parent = doc.getIn(keys.slice(0, -1), true);
    if (isMap(parent)) parent.flow = false;
  }
  const next = parseWith(schema, doc.toJS(), file);
  check?.(next);
  // The new file keeps the old one's mode: config.yaml holds keys, so it stays 0600.
  writeFileAtomic(file, doc.toString(), statSync(file).mode & 0o777);
  return next;
}
