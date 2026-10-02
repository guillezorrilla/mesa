import type {
  BasesWritten,
  DailyResult,
  MapSaved,
  McpTool,
  Opened,
  ProjectContext,
  ReceiptEntry,
  VaultInventory,
  VaultRead,
  VaultSearch,
  VaultStatus,
} from '@mesa/core';
import { command, commandWith, type Recorded } from './spec';

/** Vault commands, with the notes Mesa writes there: the daily note, the log, the map, receipts. */
export const vaultCommands = {
  'map.update': commandWith<{ all?: boolean }, MapSaved>(({ all }) => [
    'map',
    ...(all ? ['--all'] : []),
  ]),
  'log.add': commandWith<{ text: string }, { entry: string; daily: string }>(({ text }) => [
    'log',
    '--',
    text,
  ]),
  'receipts.list': commandWith<
    { project?: string; session?: string; kind: 'decision' | 'guardrail' | 'vault-change' },
    ReceiptEntry[]
  >(({ project, session, kind }) => [
    'receipts',
    '--kind',
    kind,
    ...(project ? ['--project', project] : []),
    ...(session ? ['--session', session] : []),
  ]),
  'daily.build': commandWith<{ date: string }, DailyResult>(({ date }) => [
    'daily',
    '--date',
    date,
  ]),
  'vault.context': commandWith<{ project: string }, ProjectContext>(({ project }) => [
    'vault',
    'context',
    '--',
    project,
  ]),
  'vault.list': command<VaultInventory>('vault', 'list'),
  'vault.bases': command<BasesWritten>('vault', 'bases'),
  'vault.open': command<Recorded<Opened>>('vault', 'open'),
  'vault.openNote': commandWith<{ note: string }, Opened>(({ note }) => [
    'vault',
    'open',
    '--',
    note,
  ]),
  'vault.read': commandWith<{ path: string }, VaultRead>(({ path }) => [
    'vault',
    'read',
    '--',
    path,
  ]),
  'vault.search': commandWith<{ text: string; project?: string; type?: string }, VaultSearch>(
    ({ text, project, type }) => [
      'vault',
      'search',
      ...(project ? ['--project', project] : []),
      ...(type ? ['--type', type] : []),
      '--',
      text,
    ],
  ),
  'vault.status': command<VaultStatus>('vault', 'status'),
  'vault.init': command<Recorded<{ path: string; created: string[] }>>('vault', 'init'),
  /** The mesa-vault server's tool definitions, as it lists them to a live session (ADR-0011). */
  'vault.tools': command<{ tools: McpTool[] }>('vault', 'mcp', '--tools'),
};
