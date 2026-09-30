import { readFileSync, statSync } from 'node:fs';
import { MesaError } from './result.js';

// Strict, and a leading BOM dropped, so a file saved with one still starts with its first word.
const decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * A text file a person names (a goal file, a note's file): UTF-8, its BOM dropped, otherwise
 * unchanged. No file is not_found; one that does not read, or is not UTF-8, a usage error. `what`
 * names it in those messages.
 */
export function readTextFile(file: string, what: string): string {
  let bytes: Buffer;
  try {
    if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
      throw new MesaError('not_found', `no ${what} at ${file}`);
    }
    bytes = readFileSync(file);
  } catch (error) {
    if (error instanceof MesaError) throw error;
    const code = (error as NodeJS.ErrnoException).code ?? String(error);
    throw new MesaError('usage', `cannot read the ${what} ${file}: ${code}`);
  }
  try {
    return decoder.decode(bytes);
  } catch {
    throw new MesaError('usage', `the ${what} ${file} is not UTF-8 text`);
  }
}
