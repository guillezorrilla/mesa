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
        | 'usage'
        | 'inbox';
    }
  | { kind: 'daily' }
  /** The Vault screen, searching `query` or with the item at `path` selected, when given. */
  | { kind: 'vault'; query?: string; path?: string }
  | { kind: 'project'; name: string; file?: { checkout: string; path: string; line: number } }
  | { kind: 'session'; id: string }
  /** Connecting a project's PR provider (gh or twg) from the Reviews tab. */
  | { kind: 'prs-setup'; project: string };
