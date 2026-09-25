import { resolve } from 'node:path';
import type { Clock } from './clock.js';
import { redactConfig, resolveKey, setConfigValue } from './config.js';
import { runDoctor } from './doctor.js';
import type { IdSource } from './ids.js';
import { logLine } from './notes.js';
import { type ObsidianPaths, openInObsidian } from './obsidian.js';
import { profilePaths } from './paths.js';
import type { Env, Runner } from './process.js';
import { initProfile, openProfile, type ProfileInfo } from './profile.js';
import { listProjects, registerProject, unregisterProject } from './projects.js';
import {
  actionRecorder,
  closeSessionReceipt,
  DEFAULT_RECEIPT_LIMIT,
  listReceipts,
  type Recorded,
  redactCommand,
  redactText,
  showReceipt,
} from './receipts.js';
import { MesaError, toFail } from './result.js';
import { attachSession } from './sessions/attach.js';
import { listSessions } from './sessions/list.js';
import { openSession, resumeSession } from './sessions/open.js';
import { sendPrompt } from './sessions/send.js';
import { stopSession } from './sessions/stop.js';
import type { SessionRecord } from './sessions/store.js';
import { sessionStore } from './sessions/store.js';
import { tmuxBackend } from './sessions/tmux.js';
import { initVault, vaultStatus } from './vault.js';

/** Everything Mesa takes from the outside world. Only an entrypoint builds the real one. */
export type MesaDeps = {
  home: string;
  /** Resolves relative paths the user types. */
  cwd: string;
  clock: Clock;
  newId: IdSource;
  /** Random v4 UUIDs: the agent session id Mesa hands to claude --session-id. */
  newUuid: IdSource;
  /** Waits, for polling tmux: a real timer in the CLI, instant in tests. */
  sleep: (ms: number) => Promise<void>;
  /** For `env:VAR` key values, so a receipt can redact them too. */
  env: Env;
  run: Runner;
  obsidian: ObsidianPaths;
  /** This invocation's arguments, recorded (key values redacted) in every receipt. */
  argv: readonly string[];
};

/**
 * The composition root: every Mesa service for one profile, wired to `deps`. The CLI builds one
 * per invocation; tests build one over a temp home.
 */
export function createMesa(profile: string, deps: MesaDeps) {
  const paths = profilePaths(deps.home, profile);
  const open = () => openProfile(paths);
  const absolute = (path: string) => resolve(deps.cwd, path);
  const vaultOf = () => open().config.vault;
  const notes = () => ({ vault: vaultOf(), clock: deps.clock });
  /** The profile's config if it is initialised: receipts are best effort, so no error here. */
  const configIfAny = () => {
    try {
      return open().config;
    } catch {
      return undefined;
    }
  };
  const tmux = tmuxBackend({ run: deps.run, socket: paths.tmuxSocket, env: deps.env });
  const store = sessionStore({ dir: paths.sessions, newId: deps.newId });
  /**
   * Marks `ended`'s opening receipt ended, best effort: a failure joins the recorded action's
   * warning instead of failing it.
   */
  const markEnded = async <T>(
    recorded: Recorded<T>,
    ended: SessionRecord,
  ): Promise<Recorded<T>> => {
    try {
      const at = new Date(ended.endedAt ?? deps.clock());
      await closeSessionReceipt(notes(), ended.id, at, { lastState: ended.lastState.state });
      return recorded;
    } catch (error) {
      const why = `session ${ended.id}'s receipt not marked ended: ${toFail(error).error.message}`;
      return { ...recorded, warning: [recorded.warning, why].filter(Boolean).join('; ') };
    }
  };
  const openDeps = () => ({
    profile: open(),
    profileName: profile,
    store,
    tmux,
    run: deps.run,
    clock: deps.clock,
    newUuid: deps.newUuid,
  });
  /** Both the stored key values and what their env: references resolve to. */
  const secrets = () => {
    const config = configIfAny();
    const names = Object.keys(config?.keys ?? {});
    return names
      .flatMap((n) => [config?.keys[n], config && resolveKey(config, n, deps.env)])
      .filter((s): s is string => typeof s === 'string');
  };
  const record = actionRecorder({
    profile,
    vault: () => configIfAny()?.vault,
    clock: deps.clock,
    newId: deps.newId,
    command: (argv = deps.argv) => redactCommand(argv, secrets()),
  });
  return {
    info: (): ProfileInfo => ({ profile, dir: paths.root }),
    init: (input: { vault: string; agent?: string }) => {
      const vault = absolute(input.vault);
      return record(
        {
          summary: () => `Initialised profile ${profile}`,
          failure: `Could not initialise profile ${profile}`,
          inputs: { vault, agent: input.agent ?? null },
          outputs: (r) => ({ config: r.path }),
          changed: (r) => r.created,
        },
        () => initProfile(paths, { ...input, vault }),
      );
    },
    config: {
      /** Redacted: key values are `***`. */
      get: () => redactConfig(open().config),
      set: (dotted: string, value: string) => setConfigValue(paths.config, dotted, value),
    },
    projects: {
      register: (dir: string, create = false) =>
        record(
          {
            summary: (r) => `Registered project ${r.project.name}`,
            failure: `Could not register ${absolute(dir)}`,
            project: (r) => r.project.name,
            inputs: { dir: absolute(dir), create },
            outputs: (r) => ({ path: r.path, wroteMesaYaml: r.created }),
          },
          () => registerProject(open(), { dir: absolute(dir), create }),
        ),
      list: () => listProjects(open()),
      unregister: (name: string) => unregisterProject(open(), name),
    },
    vault: {
      init: (force = false) =>
        record(
          {
            summary: (r) => `Laid out the vault: ${r.created.join(', ')}`,
            failure: 'Could not lay out the vault',
            inputs: { force },
            outputs: (r) => ({ created: r.created }),
            changed: (r) => r.created.length > 0,
          },
          () => initVault({ path: vaultOf(), force, clock: deps.clock }),
        ),
      status: () => vaultStatus(open().config.vault),
      /** Opens the vault, or one note in it, in Obsidian: the URI by default, the CLI with `cli`. */
      open: (note?: string, cli = false) => {
        const vault = configIfAny()?.vault;
        if (!vault) {
          throw new MesaError(
            'invalid_config',
            `no vault configured for profile ${profile}; run mesa init --vault <path>`,
          );
        }
        return openInObsidian({ run: deps.run, obsidian: deps.obsidian }, { vault, note, cli });
      },
    },
    log: (text: string) => logLine(notes(), text),
    receipts: {
      list: (limit = DEFAULT_RECEIPT_LIMIT) => listReceipts(vaultOf(), limit),
      show: (id: string) => showReceipt(vaultOf(), id),
    },
    sessions: {
      /** The board: sessions merged with live tmux; ended ones only with `all`. */
      list: (all = false) => listSessions({ store, tmux, clock: deps.clock }, { all }),
      /** Starts `agent` (else the project's, else the profile's) in a new window. */
      open: (project: string, agent?: string) =>
        record(
          {
            type: 'session',
            summary: (r) => `Opened session ${r.id} on ${r.project}`,
            failure: `Could not open a session on ${project}`,
            project: (r) => r.project,
            session: (r) => r.id,
            agent: (r) => r.agent,
            inputs: { project, agent: agent ?? null },
            outputs: (r) => ({
              window: r.tmux.window,
              agentSessionId: r.agentSessionId,
              lastState: r.lastState,
            }),
          },
          () => openSession(openDeps(), { project, agent }),
        ),
      /**
       * Ends a session politely, or at once with `force`. The stop gets a session receipt of its
       * own (none when it changed nothing), and the session's opening receipt is marked ended.
       */
      stop: async (id: string, force = false) => {
        const recorded = await record(
          {
            type: 'session',
            summary: (r) => `Stopped session ${id} (${r.outcome})`,
            failure: `Could not stop session ${id}`,
            project: (r) => r.record.project,
            session: () => id,
            agent: (r) => r.record.agent,
            inputs: { id, force },
            outputs: (r) => ({ outcome: r.outcome, lastState: r.record.lastState.state }),
            changed: (r) => r.outcome !== 'already-ended',
          },
          () => stopSession({ store, tmux, clock: deps.clock, sleep: deps.sleep }, id, { force }),
        );
        if (recorded.result.outcome === 'already-ended') return recorded;
        return markEnded(recorded, recorded.result.record);
      },
      /** Types a prompt into a live session's agent; an action receipt keeps its first 80 chars. */
      send: (id: string, prompt: string, force = false) => {
        const short = Array.from(prompt).slice(0, 80).join('');
        return record(
          {
            // The receipt keeps the first 80 characters, in its command line too, keys redacted.
            argv: deps.argv.map((word) => (word === prompt ? short : word)),
            summary: (r) => `Sent ${r.chars} characters to session ${id}`,
            failure: `Could not send to session ${id}`,
            project: (r) => r.project,
            session: () => id,
            inputs: { session: id, prompt: redactText(short, secrets()), force },
            outputs: (r) => ({ chars: r.chars }),
          },
          () => sendPrompt({ store, tmux, clock: deps.clock }, id, prompt, { force }),
        );
      },
      /** Reopens a session's conversation in a new window, as a new record linked to the old. */
      resume: (id: string) =>
        record(
          {
            type: 'session',
            summary: (r) => `Resumed session ${r.from.id} as ${r.record.id} on ${r.record.project}`,
            failure: `Could not resume session ${id}`,
            project: (r) => r.record.project,
            session: (r) => r.record.id,
            agent: (r) => r.record.agent,
            inputs: { id },
            outputs: (r) => ({
              window: r.record.tmux.window,
              agentSessionId: r.record.agentSessionId,
              resumedFrom: r.from.id,
            }),
          },
          () => resumeSession(openDeps(), id),
        ).then((recorded) => markEnded(recorded, recorded.result.from)),
      /** Attaches to a live session: here (the argv to exec), or in config `terminal.app`. */
      attach: (id: string, app = false) =>
        attachSession(
          { store, tmux, run: deps.run, scripts: paths.attachScripts, env: deps.env },
          id,
          app ? open().config.terminal.app : undefined,
        ),
    },
    /** The windows on the profile's tmux server, or one project's. */
    windows: (project?: string) => tmux.listWindows(project),
    doctor: () => runDoctor({ run: deps.run, obsidian: deps.obsidian, profileDir: paths.root }),
  };
}

export type Mesa = ReturnType<typeof createMesa>;
