import { existsSync } from 'node:fs';
import { runningConversation } from '../../agents/claude/listing.js';
import { claudeTranscripts } from '../../agents/claude/paths.js';
import { transcriptFile } from '../../agents/claude/transcripts.js';
import { MesaError } from '../../lib/result.js';
import { findProject } from '../../projects/projects.js';
import { quitAgent, type StopDeps } from '../end/stop.js';
import { askHost, hostSocket } from '../host/socket.js';
import { GENERAL_PROJECT } from '../record/general.js';
import { inTurn } from '../record/lifecycle.js';
import type { SessionRecord } from '../record/record.js';
import { windowOf } from '../window/window-name.js';
import { folderOf, type LaunchDeps, startSession } from './launch.js';
import { resumeCommand } from './resume.js';

// Switching a session between Structured and Terminal view (ADR-0029): the same conversation, one
// process stopped and the other resumed in the session's window, never two at once.

export const VIEWS = ['structured', 'terminal'] as const;
export type View = (typeof VIEWS)[number];

export type Switched = { record: SessionRecord; switched: boolean; warning?: string };

/** How long the stopped process has to leave claude's listing before the switch gives up. */
const GONE_WAIT_MS = 5000;
const POLL_MS = 250;

/**
 * Switches session `id` to view `to`: its agent stopped (a Structured one through its host's
 * socket, a Terminal one as `mesa stop` asks it), then the conversation resumed in its window under
 * the other view, the record's `view` changed. Already in `to`, nothing happens. Mid-turn, it is
 * refused unless `interrupt`, which stops the turn first. Refused while claude still runs the
 * conversation after the stop, and while another switch runs. Only a live, interactive Claude Code
 * session with a conversation switches.
 */
export async function switchView(
  deps: LaunchDeps & StopDeps,
  id: string,
  to: View,
  { interrupt = false } = {},
): Promise<Switched> {
  const found = deps.store.get(id);
  const refuse = (why: string) => new MesaError('usage', `session ${id} ${why}`);
  if (found.kind !== 'interactive' || found.agent !== 'claude')
    throw refuse('is not a Claude Code session; only Claude Code has Structured view yet');
  if ((found.view ?? 'terminal') === to) return { record: found, switched: false };
  if (found.endedAt || found.sleeping || found.lastState.state === 'queued')
    throw refuse(`is not running; mesa resume or mesa wake ${id} first`);
  if (found.background) throw refuse("runs in Claude's background mode, which has no views");
  const sessionId = found.agentSessionId;
  if (!sessionId) throw refuse('has no Claude session id to resume');
  // `claude --resume` needs a transcript; the host starts a new conversation without one.
  if (to === 'terminal' && !transcriptFile(claudeTranscripts(deps.home, deps.env), sessionId))
    throw refuse('has no conversation yet; send it a message first');
  const pane = await deps.tmux.findWindow(windowOf(found));
  if (!pane || pane.dead) throw refuse(`is not running; mesa resume ${id} first`);
  if (inTurn(found) && !interrupt)
    throw refuse('is mid-turn: wait for it to finish, or interrupt and switch (--interrupt)');
  const project =
    found.project === GENERAL_PROJECT ? null : findProject(deps.profile, found.project);
  const folder = folderOf(found, project);
  if (!existsSync(folder))
    throw new MesaError('not_found', `session ${id}'s folder ${folder} is gone`);

  const at = deps.clock().toISOString();
  let claimed = false;
  deps.store.update(id, (current) => {
    if (current.switching) return {};
    claimed = true;
    return { switching: { at } };
  });
  if (!claimed) throw refuse('is switching already');
  const release = () =>
    deps.store.update(id, (current) =>
      current.switching?.at === at ? { switching: undefined } : {},
    );
  try {
    if (found.view === 'structured') {
      const socket = hostSocket(deps.profile.paths.hosts, id);
      if (interrupt) await askHost(socket, { type: 'interrupt' });
      await askHost(socket, { type: 'stop' });
    }
    // A Terminal agent gets Escape (its interrupt) and /exit; a host that stopped is a dead pane.
    await quitAgent(deps, found, { force: found.view === 'structured' });
    for (let waited = 0; ; waited += POLL_MS) {
      const running = await runningConversation(deps, sessionId);
      if (!running) break;
      if (waited >= GONE_WAIT_MS)
        throw refuse(
          `still has claude running its conversation (pid ${running.pid}); stop it first`,
        );
      await deps.sleep(POLL_MS);
    }
    const record = deps.store.update(id, (current) => ({
      view: to,
      // Idle from now, as after a wake: the new process's hooks speak next.
      lastState: { ...current.lastState, state: 'idle' as const, at, source: 'tmux' as const },
      events: [...current.events, { type: 'switched' as const, at, to }],
    }));
    const started = await startSession(deps, record, project, {
      command: (r, deny) => resumeCommand(deps, found, r.id, folder, deny),
    });
    return { ...started, record: release(), switched: true };
  } catch (error) {
    try {
      release();
    } catch {
      // The switch's own error says more.
    }
    throw error;
  }
}
