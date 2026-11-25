import type { CloudLogEntry, CopyFormat } from '@mesa/core';
import type { CloudFilters } from '@/lib/client/logs';
import type { CloudMode } from '@/lib/workspaceView';

// The cloud UI's shared shapes (CONTEXT.md, Cloud Logs), so each component file exports one thing.

/** Where the Logs tab goes next: a view, its filters, a conversation and a question to start. */
export type CloudLogsView = { mode: CloudMode; query: CloudFilters; ask?: string; prompt?: string };

/** What an entry row can do, one stable object for every row. */
export type EntryActions = {
  onSelect: (entry: CloudLogEntry) => void;
  onExpand: (entry: CloudLogEntry) => void;
  onShow: (entry: CloudLogEntry) => void;
  onHide: (entry: CloudLogEntry) => void;
  onAsk: (entry: CloudLogEntry) => void;
  onFix: (entry: CloudLogEntry) => void;
  onField: (key: string, value: string) => void;
  onCopy: (entry: CloudLogEntry, format: CopyFormat) => void;
  onCopyText: (text: string, what: string) => void;
};

/** An env row: a suggestion as the person left it, or a custom one. */
export type EnvRow = { name: string; filter: string; on: boolean; from?: string };

/** Which projects the project list shows. */
export type ProjectTab = 'recent' | 'starred' | 'all';
