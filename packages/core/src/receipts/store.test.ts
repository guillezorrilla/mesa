import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { fixedClock, sequentialIds, tempDir } from '../testing/index.js';
import { initVault } from '../vault/vault.js';
import { EXAMPLES } from './receipts.examples.js';
import { writeReceipt } from './store.js';

const vaultWithLog = () => {
  const vault = join(tempDir(), 'vault');
  initVault({ path: vault, clock: fixedClock() });
  return vault;
};
const files = (vault: string) => readdirSync(join(vault, 'receipts'), { recursive: true });
const logLines = (vault: string, id: string) =>
  readFileSync(join(vault, 'log.md'), 'utf8')
    .split('\n')
    .filter((line) => line.includes(id));

test('a retried write with the same key returns the first receipt: one file, one log line', () => {
  const vault = vaultWithLog();
  const first = writeReceipt(
    { vault, clock: fixedClock('2026-09-24T12:00:00.000Z'), newId: sequentialIds() },
    EXAMPLES.action,
    'retry-key',
  );
  // The retry runs a minute later with fresh ids: the key alone names the receipt.
  const retry = writeReceipt(
    { vault, clock: fixedClock('2026-09-24T12:01:00.000Z'), newId: sequentialIds() },
    EXAMPLES.action,
    'retry-key',
  );
  expect(retry).toEqual({ receipt: first.receipt, path: first.path });
  expect(files(vault).filter((f) => String(f).endsWith('.md'))).toHaveLength(1);
  expect(logLines(vault, first.receipt.id)).toHaveLength(1);

  const other = writeReceipt(
    { vault, clock: fixedClock(), newId: sequentialIds() },
    EXAMPLES.action,
    'another-key',
  );
  expect(other.receipt.id).not.toBe(first.receipt.id);
});

test('a retry after a write that stopped before its log line restores the line', () => {
  const vault = vaultWithLog();
  const deps = { vault, clock: fixedClock(), newId: sequentialIds() };
  const first = writeReceipt(deps, EXAMPLES.action, 'stopped');
  const log = join(vault, 'log.md');
  const without = readFileSync(log, 'utf8').replace(/^.*receipt.*\n/m, '');
  writeFileSync(log, without);
  expect(logLines(vault, first.receipt.id)).toHaveLength(0);
  writeReceipt(deps, EXAMPLES.action, 'stopped');
  expect(logLines(vault, first.receipt.id)).toHaveLength(1);
});

test('a write that finds its file already made returns that receipt', () => {
  const vault = vaultWithLog();
  // Two writers drawing the same id in the same second: the second finds the first's file.
  const same = () => ({ vault, clock: fixedClock(), newId: () => '01TESTSAMEXD00000000000000' });
  const first = writeReceipt(same(), EXAMPLES.action);
  const second = writeReceipt(same(), { ...EXAMPLES.action, summary: 'Another summary' });
  expect(second.path).toBe(first.path);
  expect(readFileSync(join(vault, first.path), 'utf8')).not.toContain('Another summary');
  expect(files(vault).filter((f) => String(f).endsWith('.md'))).toHaveLength(1);
});
