import type { SearchHit } from '@mesa/core/browser';
import type { WorkspaceView } from '@/lib/workspaceView';

/** What opens over the current view: Usage, Settings, Keyboard shortcuts and Feedback as dialogs, Notifications as a menu. */
export type Overlay = 'usage' | 'inbox' | 'settings' | 'shortcuts' | 'feedback';

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
  'impact',
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
  if (hit.kind === 'impact')
    return {
      kind: 'impact',
      ...(hit.project ? { project: hit.project } : {}),
      ...(hit.session ? { session: hit.session } : {}),
    };
  const destination = PALETTE_DESTINATIONS.find((kind) => kind === hit.id);
  return destination ? { kind: destination } : undefined;
}
