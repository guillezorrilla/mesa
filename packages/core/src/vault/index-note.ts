import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { VAULT } from './layout.js';
import { wikilink } from './links.js';
import { vaultFile } from './scope.js';

// The vault's index.md (CONTEXT.md, Vault): one line per note, `- [[<note>]]: <summary>`.

/**
 * Adds the note at `path` to index.md with its one-line summary, unless the index links it
 * already. Bookkeeping, never recorded (#274). Callers hold the vault lock.
 */
export function addToIndex(vault: string, path: string, summary: string): void {
  const link = wikilink(path);
  const index = vaultFile(vault, VAULT.index);
  const text = existsSync(index) ? readFileSync(index, 'utf8') : '';
  if (text.includes(link)) return;
  const line = `- ${link}: ${summary.replace(/\s+/g, ' ').trim()}\n`;
  appendFileSync(index, text && !text.endsWith('\n') ? `\n${line}` : line);
}
