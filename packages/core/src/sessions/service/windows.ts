import type { MesaContext } from '../../context.js';
import { applyControls, type ControlChange, sessionControls } from '../host/controls.js';
import { hostSession } from '../host/host.js';
import { interruptSession } from '../host/interrupt.js';
import { projectScope } from '../record/general.js';
import { recordAgent } from '../record/record.js';
import { attachSession } from '../window/attach.js';
import { outputSince } from '../window/output-log.js';
import { sessionPanel } from '../window/panel.js';
import { resizeSession } from '../window/resize.js';
import { sessionScreen } from '../window/screen.js';
import { viewProject } from '../window/view.js';
import type { SessionDeps } from './deps.js';

/** Where a session is seen: its tmux window sized, attached, or laid out with its project's. */
export function windowActions(ctx: MesaContext, deps: SessionDeps) {
  const { open, store, tmux } = ctx;
  const { terminal, terminalApp, ensureBackgroundView } = deps;
  return {
    /**
     * Runs a Structured session's agent in this process, its window's (ADR-0029), writing its
     * status line to `write`; the host returned settles when the agent ends.
     */
    host: (id: string, write: (text: string) => void) => {
      const launch = deps.openDeps();
      return hostSession({ ...launch, spawn: ctx.spawn, cwd: ctx.cwd }, id, write);
    },
    /** A Structured session's model, effort and mode as its agent confirmed them (controls.ts). */
    controls: (id: string) => sessionControls({ store, journals: ctx.paths.journals }, id),
    /** Changes them through its host once the agent confirms, with a receipt (applyControls). */
    setControls: (id: string, change: ControlChange) =>
      ctx.record(
        {
          type: 'session',
          summary: () =>
            `Set session ${id}'s ${Object.entries(change)
              .map(([k, v]) => `${k} ${v}`)
              .join(', ')}`,
          failure: `Could not change session ${id}'s controls`,
          project: () => projectScope(store.get(id).project),
          session: () => id,
          agent: () => recordAgent(store.get(id)),
          inputs: { id, ...change },
          outputs: (r) => ({ model: r.model, effort: r.effort, mode: r.mode }),
        },
        () =>
          applyControls(
            { store, journals: ctx.paths.journals, hosts: ctx.paths.hosts, sleep: ctx.sleep },
            id,
            change,
          ),
      ),
    /** Stops a Structured session's agent mid-turn through its host, with a receipt (interruptSession). */
    interrupt: (id: string) =>
      ctx.record(
        {
          type: 'session',
          summary: () => `Interrupted session ${id}'s agent`,
          failure: `Could not interrupt session ${id}`,
          project: () => projectScope(store.get(id).project),
          session: () => id,
          agent: () => recordAgent(store.get(id)),
          inputs: { id },
          outputs: () => ({}),
        },
        () => interruptSession({ store, hosts: ctx.paths.hosts }, id),
      ),
    /** Sizes a session's window to a view now (the app's terminal, after each fit). */
    resize: (id: string, cols: number, rows: number) =>
      resizeSession({ store, tmux }, id, cols, rows),
    /** A session's window sized to the phone, as its terminal draws it (sessionScreen). */
    screen: (id: string, cols: number, rows: number) =>
      sessionScreen({ store, tmux, logs: ctx.paths.logs }, id, cols, rows),
    /** What slash command `command` shows in a session's pane now, with colours (sessionPanel). */
    panel: (id: string, command: string) => sessionPanel({ store, tmux }, id, command),
    /** What a session's window printed since byte `from` of its output log (outputSince). */
    since: (id: string, from?: number) => outputSince(ctx.paths.logs, id, from),
    /**
     * Attaches to a live session: here (the argv to exec), or in config `terminal.app`;
     * `embedded` for the app's own terminal, which scrolls one line per wheel report.
     */
    attach: async (id: string, app = false, embedded = false) => {
      await ensureBackgroundView(id);
      return attachSession(
        {
          store,
          tmux,
          ...terminal,
          naturalSelection: open().config.terminal.naturalSelection,
          wezTermNewTab: open().config.terminal.wezTermNewTab,
        },
        id,
        app ? terminalApp() : undefined,
        embedded,
      );
    },
    /**
     * Shows a project's sessions side by side in one terminal, laid out by its mesa.yaml
     * `tmux.layout` (CONTEXT.md, Project view): here (the argv to exec), or in `terminal.app`.
     */
    view: (project: string, app = false) =>
      viewProject(
        {
          profile: open(),
          store,
          tmux,
          ...terminal,
          wezTermNewTab: open().config.terminal.wezTermNewTab,
        },
        project,
        app ? terminalApp() : undefined,
      ),
  };
}
