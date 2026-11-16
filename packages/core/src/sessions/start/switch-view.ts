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
import type { SessionRecord, View } from '../record/record.js';
import { PROCESS } from '../signals/state.js';
import { windowOf } from '../window/window-name.js';
import { folderOf, type LaunchDeps, startSession } from './launch.js';
import { resumeCommand } from './resume.js';

// Switching a session between Structured and Terminal view (ADR-0029): the same conversation, one
// process stopped and the other resumed in the session's window, never two at once.

export type Switched = { record: SessionRecord; switched: boolean; warning?: string };

/** A switch marker older than this is a crashed switch's, and a new switch takes it over. */
const STALE_SWITCH_MS = 2 * 60_000;
/** How long the stopped process has to leave claude's listing before the switch gives up. */
const GONE_WAIT_MS = 5000;
const POLL_MS = 250;

/**
 * Switches session `id` to view `to`: its agent stopped (a Structured one through its host's
 * socket, a Terminal one as `mesa stop` asks it), then the conversation resumed in its window under
 * the other view, the record's `view` changed. Already in `to`, nothing happens. Mid-turn, it is
 * refused unless `interrupt`, which stops the turn first. Refused while claude still runs the
 * conversation after the stop, and while another switch runs. Only a live, interactive Claude Code
 * or Codex session with a conversation switches; Codex's Terminal view is Mesa's embedded
 * `codex resume` (resumeCommand), never a plain one, which starts a self-updating daemon.
 */
export async function switchView(
  deps: LaunchDeps & StopDeps,
  id: string,
  to: View,
  { interrupt = false } = {},
): Promise<Switched> {
  const found = deps.store.get(id);
  const refuse = (why: string) => new MesaError('usage', `session ${id} ${why}`);
  const { agent } = found;
  if (found.kind !== 'interactive' || (agent !== 'claude' && agent !== 'codex'))
    throw refuse('is not a Claude Code or Codex session; only they have Structured view');
  if ((found.view ?? 'terminal') === to) return { record: found, switched: false };
  if (found.endedAt || found.sleeping || found.lastState.state === 'queued')
    throw refuse(`is not running; mesa resume or mesa wake ${id} first`);
  if (found.background) throw refuse("runs in Claude's background mode, which has no views");
  const sessionId = found.agentSessionId;
  // A Structured Codex session has its thread id once app-server opened the thread.
  if (!sessionId)
    throw refuse(
      agent === 'codex'
        ? 'has no conversation yet; send it a message first'
        : 'has no Claude session id to resume',
    );
  // `claude --resume` needs a transcript; the host starts a new conversation without one.
  if (
    to === 'terminal' &&
    agent === 'claude' &&
    !transcriptFile(claudeTranscripts(deps.home, deps.env), sessionId)
  )
    throw refuse('has no conversation yet; send it a message first');
  const pane = await deps.tmux.findWindow(windowOf(found));
  if (!pane || pane.dead) throw refuse(`is not running; mesa resume ${id} first`);
  const project =
    found.project === GENERAL_PROJECT ? null : findProject(deps.profile, found.project);
  const folder = folderOf(found, project);
  if (!existsSync(folder))
    throw new MesaError('not_found', `session ${id}'s folder ${folder} is gone`);

  const at = deps.clock().toISOString();
  const midTurn = 'is mid-turn: wait for it to finish, or interrupt and switch (--interrupt)';
  if (inTurn(found) && !interrupt) throw refuse(midTurn);
  let refused: string | undefined;
  deps.store.update(id, (current) => {
    const since = current.switching ? Date.parse(at) - Date.parse(current.switching.at) : Infinity;
    if (since < STALE_SWITCH_MS) refused = 'is switching already';
    // Decided on `found`: what changed since, another switch or a new turn, is checked again here.
    else if (current.view !== found.view)
      refused = 'changed view while the switch began; try again';
    else if (inTurn(current) && !interrupt) refused = midTurn;
    if (refused) return {};
    return { switching: { at } };
  });
  if (refused) throw refuse(refused);
  const release = () =>
    deps.store.update(id, (current) =>
      current.switching?.at === at ? { switching: undefined } : {},
    );
  // Set once the old process is gone: a failure after it leaves the session exited, not idle.
  let gone = false;
  try {
    if (found.view === 'structured') {
      const socket = hostSocket(deps.profile.paths.hosts, id);
      if (interrupt) await askHost(socket, { type: 'interrupt' });
      await askHost(socket, { type: 'stop' });
    }
    // A Terminal agent gets Escape (its interrupt) and /exit; a host that stopped is a dead pane.
    // The window stays: a view the app has attached to it would otherwise fall to a sibling.
    await quitAgent(deps, found, { force: found.view === 'structured', keepWindow: true });
    // shortcut: Codex lists no processes, so its stop is the pane's: quitAgent ends what runs
    // there, and codex (the TUI, or the host's app-server child) goes with it.
    for (let waited = 0; agent === 'claude'; waited += POLL_MS) {
      const running = await runningConversation(deps, sessionId);
      if (!running) break;
      if (waited >= GONE_WAIT_MS)
        throw refuse(
          `still has claude running its conversation (pid ${running.pid}); stop it first`,
        );
      await deps.sleep(POLL_MS);
    }
    gone = true;
    // Stamped once the old process is gone, so its SessionEnd, which lands after the switch
    // began, falls before it and no longer speaks for the session (measured live).
    const stopped = deps.clock().toISOString();
    const record = deps.store.update(id, (current) => ({
      view: to,
      // Idle from now, as after a wake: the new process's hooks speak next.
      lastState: {
        ...current.lastState,
        state: 'idle' as const,
        at: stopped,
        source: 'tmux' as const,
      },
      events: [...current.events, { type: 'switched' as const, at: stopped, to }],
    }));
    const started = await startSession(deps, record, project, {
      command: (r, deny) => resumeCommand(deps, found, r.id, folder, deny),
      inPlace: true,
    });
    return { ...started, record: release(), switched: true };
  } catch (error) {
    try {
      release();
      // Its pane-died and SessionEnd were the switch's, so the exit is recorded here; Resume reopens it.
      if (gone) {
        const now = deps.clock().toISOString();
        deps.store.update(id, (current) => ({
          lastState: {
            state: 'failed' as const,
            confidence: PROCESS,
            at: now,
            source: 'tmux' as const,
          },
          events: [...current.events, { type: 'exited' as const, at: now }],
        }));
      }
    } catch {
      // The switch's own error says more.
    }
    throw error;
  }
}
