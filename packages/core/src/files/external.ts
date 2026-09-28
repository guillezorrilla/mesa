import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import type { Checkout } from '../git/checkout.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { readWorkspaceFile } from './editor.js';

/** A configured executable and literal argv template, never a shell command. */
export function validExternalArgv(argv: string[]): boolean {
  return (
    argv.length > 1 &&
    argv.length <= 16 &&
    isAbsolute(argv[0] ?? '') &&
    argv.every((arg) => arg.length > 0 && !arg.includes('\0') && !/[\r\n]/.test(arg)) &&
    (
      argv
        .slice(1)
        .join('')
        .match(/\{file\}/g) ?? []
    ).length === 1 &&
    argv.slice(1).join('').replaceAll('{file}', '').replaceAll('{line}', '').match(/[{}]/) === null
  );
}

export async function openExternalFile(
  checkout: Checkout,
  path: string,
  line: number | undefined,
  argv: string[],
  run: Runner,
) {
  if (!validExternalArgv(argv)) {
    throw new MesaError(
      'usage',
      'configure editor.external as absolute executable argv with {file}',
    );
  }
  const file = readWorkspaceFile(checkout, path, line);
  const executable = argv[0] as string;
  let actual: string;
  try {
    actual = realpathSync.native(executable);
    if (!statSync(actual).isFile()) throw new Error('not a file');
    accessSync(actual, constants.X_OK);
  } catch {
    throw new MesaError('not_found', `external editor ${executable} is unavailable`);
  }
  const within = relative(checkout.path, actual);
  if (!within || (!within.startsWith('..') && !isAbsolute(within))) {
    throw new MesaError('usage', 'external editor executable cannot be in the checkout');
  }
  const args = argv
    .slice(1)
    .map((arg) =>
      arg
        .replaceAll('{file}', join(checkout.path, file.path))
        .replaceAll('{line}', String(line ?? 1)),
    );
  const result = await run(executable, args, 5000);
  if (!result.ok) throw new MesaError('usage', `external editor did not open: ${result.detail}`);
  return { checkout, path: file.path, line: line ?? 1, opened: true };
}
