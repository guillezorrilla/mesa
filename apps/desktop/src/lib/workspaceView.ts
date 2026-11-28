import type { CloudFilters } from './client/logs';
import type { PrRef } from './client/prs';

/** The Logs tab's modes: error groups first, then entries, then a conversation. */
export type CloudMode = 'errors' | 'explorer';

export type WorkspaceView =
  | {
      kind:
        | 'sessions'
        | 'grid'
        | 'doctor'
        | 'help'
        | 'about'
        | 'shortcuts'
        | 'preferences'
        | 'prompts'
        | 'backup'
        | 'automations'
        | 'onboarding'
        | 'map'
        | 'office'
        | 'usage'
        | 'inbox';
    }
  | { kind: 'daily' }
  /** Impact for the profile, one project, or with one session's card first and open. */
  | { kind: 'impact'; project?: string; session?: string }
  /** The Vault screen, searching `query` or with the item at `path` selected, when given. */
  | { kind: 'vault'; query?: string; path?: string }
  | { kind: 'project'; name: string; file?: { checkout: string; path: string; line: number } }
  | { kind: 'session'; id: string }
  /** Connecting a project's PR provider (gh or twg) from the Reviews tab. */
  | { kind: 'prs-setup'; project: string }
  /** Cloud Logs in a mode, picked by `query`; Ask showing conversation `ask` when given. */
  | { kind: 'logs'; mode?: CloudMode; query?: CloudFilters; ask?: string; prompt?: string }
  /** One pull request's detail, opened from a Reviews list. */
  | ({ kind: 'pr' } & PrRef);
