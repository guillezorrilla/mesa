import type { SearchHit } from '@mesa/core/browser';

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
        | 'tour'
        | 'setup'
        | 'map'
        | 'usage'
        | 'inbox';
    }
  | { kind: 'daily' }
  /** The Vault screen, searching `query` or with the item at `path` selected, when given. */
  | { kind: 'vault'; query?: string; path?: string }
  | { kind: 'project'; name: string; file?: { checkout: string; path: string; line: number } }
  | { kind: 'session'; id: string };

/** Usage and Notifications open over the current view, as a dialog and a menu. */
export type Overlay = 'usage' | 'inbox' | 'settings' | 'shortcuts';

/** The command palette's action and setting ids that open the view of the same kind. */
const PALETTE_DESTINATIONS = [
  'sessions',
  'grid',
  'doctor',
  'usage',
  'inbox',
  'help',
  'preferences',
  'prompts',
  'backup',
  'automations',
  'shortcuts',
] as const;

/**
 * The view a command palette hit opens: a project, session, or vault search by its kind, else a
 * destination by its id. Undefined for the hits that act instead (new session, open vault, profile,
 * a saved prompt).
 */
export function paletteView(hit: SearchHit): WorkspaceView | undefined {
  if (hit.kind === 'project') return { kind: 'project', name: hit.id };
  if (hit.kind === 'session') return { kind: 'session', id: hit.id };
  if (hit.kind === 'vault') return { kind: 'vault', query: hit.id };
  const destination = PALETTE_DESTINATIONS.find((kind) => kind === hit.id);
  return destination ? { kind: destination } : undefined;
}
