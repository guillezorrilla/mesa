import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { hooksStatus, installHooks, uninstallHooks } from './agents/claude/hooks.js';
import { claudeTranscripts } from './agents/claude/paths.js';
import { adapterBackend } from './decisions/adapter.js';
import { decide, type FaroProfile, selectBackend } from './decisions/decide.js';
import { rulesBackend } from './decisions/rules.js';
import type { Question } from './decisions/types.js';
import { runDoctor } from './doctor.js';
import type { Clock } from './lib/clock.js';
import type { IdSource } from './lib/ids.js';
import type { Env, Runner } from './lib/process.js';
import { redactPayload } from './lib/redact.js';
import { MesaError, toFail } from './lib/result.js';
import { redactConfig, resolveKey, setConfigValue } from './profile/config.js';
import { profilePaths, profilesDir } from './profile/paths.js';
import { initProfile, openProfile, type ProfileInfo } from './profile/profile.js';
import { listProjects, registerProject, unregisterProject } from './projects/projects.js';
import { readRegistry } from './projects/registry.js';
import {
  actionRecorder,
  closeSessionReceipt,
  DEFAULT_RECEIPT_LIMIT,
  listReceipts,
  type Recorded,
  receiptText,
  redactCommand,
  showReceipt,
} from './receipts/receipts.js';
import { adoptSession } from './sessions/adopt.js';
import { listAgentProcesses } from './sessions/agent-listing.js';
import { attachSession, resizeSession } from './sessions/attach.js';
import { listSessions, sessionTree } from './sessions/board/board.js';
import { callerOf, windowId } from './sessions/caller.js';
import { readHookEvents, recordHookEvent } from './sessions/hook-events.js';
import { type OpenInput, openSession, readGoal, resumeSession } from './sessions/open.js';
import { recordPaneDied } from './sessions/pane-died.js';
import type { SessionRecord } from './sessions/record.js';
import { sendPrompt } from './sessions/send.js';
import { stopSession } from './sessions/stop.js';
import { sessionStore } from './sessions/store.js';
import { tmuxBackend } from './sessions/tmux/backend.js';
import { logLine } from './vault/notes.js';
import { type ObsidianPaths, openInObsidian } from './vault/obsidian.js';
import { initVault, vaultStatus } from './vault/vault.js';

/** Everything Mesa takes from the outside world. Only an entrypoint builds the real one. */
export type MesaDeps = {
  home: string;
  /** Resolves relative paths the user types. */
  cwd: string;
  clock: Clock;
  newId: IdSource;
  /** Random v4 UUIDs: the agent session id Mesa hands to claude --session-id. */
  newUuid: IdSource;
  /** The argv that runs this mesa, for the agent hooks that call back into it. */
  self: readonly string[];
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
  const tmux = tmuxBackend({
    run: deps.run,
    socket: paths.tmuxSocket,
    env: deps.env,
    paneDied: { self: deps.self, profile },
  });
  /** The pane-died hook on the profile's tmux server, and whether a server runs there. */
  const tmuxHook = async () => ({ socket: paths.tmuxSocket, ...(await tmux.paneDiedHookState()) });
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
  /**
   * The agent session ids this home's other profiles' records hold, so their sessions are not
   * foreign on this board. A profile whose records do not read counts as none.
   */
  // ponytail: by agent session id only; another profile's session after a /clear still lists
  // here as foreign. Ask each profile's tmux for its pane pids if that shows.
  const otherProfilesSessions = () => {
    const root = profilesDir(deps.home);
    if (!existsSync(root)) return new Set<string>();
    const others = readdirSync(root, { withFileTypes: true }).filter(
      (e) => e.isDirectory() && e.name !== profile,
    );
    return new Set(
      others.flatMap((e) => {
        const dir = profilePaths(deps.home, e.name).sessions;
        try {
          return sessionStore({ dir, newId: deps.newId })
            .list()
            .flatMap((r) => (r.agentSessionId ? [r.agentSessionId] : []));
        } catch {
          return [];
        }
      }),
    );
  };
  /** Each registered project's priority, read once per board; 0.5 for one without (the default). */
  const priorities = () => {
    let known = new Map<string, number>();
    try {
      known = new Map(listProjects(open()).map((p) => [p.name, p.priority ?? 0.5]));
    } catch {
      // No profile, or a registry that does not read: every project counts as 0.5.
    }
    return (project: string | null) => (project ? known.get(project) : undefined) ?? 0.5;
  };
  // ponytail: jev joins here when its backend lands (a paid API, used only with a key).
  /** Faro's shared backends, asked when a decision site's own rules are unsure. */
  const shared = [
    adapterBackend<unknown>({
      run: deps.run,
      redact: (value, maxString) => redactPayload(value, deps.home, secrets(), maxString),
    }),
  ];
  /** For questions no rules know (mesa decide), the rules answer evenly. */
  const FARO_BACKENDS = [rulesBackend<unknown>([]), ...shared];
  /** Faro's view of the profile; before init, rules only (nothing else is configured). */
  const faroProfile = (): FaroProfile => {
    const config = configIfAny();
    return {
      decisions: config?.decisions ?? { backend: 'rules', threshold: 1 },
      hasKey: (name) => Boolean(config && resolveKey(config, name, deps.env)),
    };
  };
  /** Who runs this mesa: the session whose Mesa window it is in, if any. */
  const caller = () => callerOf({ store, env: deps.env, profileName: profile });
  const openDeps = () => ({
    profile: open(),
    profileName: profile,
    store,
    tmux,
    run: deps.run,
    clock: deps.clock,
    newUuid: deps.newUuid,
    caller,
  });
  /**
   * Both the stored key values and what their env: references resolve to. None when the config
   * does not read: receipts and the adapter, the writes that use these, need that config to run.
   */
  const secrets = () => {
    const config = configIfAny();
    const names = Object.keys(config?.keys ?? {});
    return names
      .flatMap((n) => [config?.keys[n], config && resolveKey(config, n, deps.env)])
      .filter((s): s is string => typeof s === 'string');
  };
  /**
   * secrets(), for a write that needs no config (a hook's log): a config that does not read
   * refuses the write, so no key it would have hidden is written.
   */
  const secretsOrRefuse = () => {
    if (existsSync(paths.config)) open();
    return secrets();
  };
  /** The board: sessions merged with live tmux and the agent listing; ended ones only with `all`. */
  const board = (all = false) =>
    listSessions(
      {
        store,
        tmux,
        listing: () => listAgentProcesses(deps.run),
        projects: readRegistry(paths.registry),
        elsewhere: otherProfilesSessions,
        events: (id) => readHookEvents(paths.events, id),
        priorityOf: priorities(),
        faro: faroProfile(),
        backends: shared,
        clock: deps.clock,
      },
      { all },
    );
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
        const vault = vaultOf();
        return openInObsidian({ run: deps.run, obsidian: deps.obsidian }, { vault, note, cli });
      },
    },
    log: (text: string) => logLine(notes(), text),
    receipts: {
      list: (limit = DEFAULT_RECEIPT_LIMIT) => listReceipts(vaultOf(), limit),
      show: (id: string) => showReceipt(vaultOf(), id),
    },
    sessions: {
      list: board,
      /** The board as a tree: children under their parent, each row with its depth. */
      tree: async (all = false) => sessionTree(await board(all)),
      /**
       * Starts `agent` (else the project's, else the profile's) in a new window, with the goal
       * as its first prompt, and with `branch`, in its own git worktree. The goal is read first,
       * so the receipt keeps it (receiptText); one Mesa cannot take fails inside the recorded
       * action, as every refusal does.
       */
      open: (project: string, opts: Omit<OpenInput, 'project'> & { goalFile?: string } = {}) => {
        const { agent, parent, noParent, branch, base } = opts;
        let goal: string | undefined;
        let refused: unknown;
        try {
          goal = readGoal({
            goal: opts.goal,
            goalFile: opts.goalFile === undefined ? undefined : absolute(opts.goalFile),
          });
        } catch (error) {
          refused = error;
        }
        const text = goal ?? opts.goal;
        const kept = text === undefined ? undefined : receiptText(text, deps.argv, secrets());
        return record(
          {
            type: 'session',
            ...(kept ? { argv: kept.argv } : {}),
            summary: (r) => `Opened session ${r.id} on ${r.project}`,
            failure: `Could not open a session on ${project}`,
            project: (r) => r.project,
            session: (r) => r.id,
            agent: (r) => r.agent,
            inputs: {
              project,
              agent: agent ?? null,
              ...(kept ? { goal: kept.short } : {}),
              ...(parent === undefined ? {} : { parent }),
              ...(noParent ? { noParent } : {}),
              ...(branch === undefined ? {} : { branch }),
              ...(base === undefined ? {} : { base }),
            },
            outputs: (r) => ({
              window: r.tmux.window,
              agentSessionId: r.agentSessionId,
              lastState: r.lastState,
              parent: r.parent ?? null,
              ...(r.worktree ? { worktree: r.worktree } : {}),
            }),
          },
          async () => {
            if (refused) throw refused;
            const input = { project, agent, goal, parent, noParent, branch, base };
            return openSession(openDeps(), input);
          },
        );
      },
      /** A session's goal, or not_found when it was started without one. */
      goal: (id: string) => {
        const { goal } = store.get(id);
        if (goal === undefined) throw new MesaError('not_found', `session ${id} has no goal`);
        return { id, goal };
      },
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
      /**
       * Types a prompt into a live session's agent, from another session (`from`, else the window
       * this runs in) when there is one; an action receipt keeps its first 80 chars.
       */
      send: (
        id: string,
        prompt: string,
        opts: { force?: boolean; from?: string; noFrom?: boolean } = {},
      ) => {
        const { force = false, from, noFrom } = opts;
        const kept = receiptText(prompt, deps.argv, secrets());
        return record(
          {
            argv: kept.argv,
            summary: (r) =>
              `Sent ${r.chars} characters to session ${id}${r.from ? ` from ${r.from}` : ''}`,
            failure: `Could not send to session ${id}`,
            project: (r) => r.project,
            session: () => id,
            inputs: {
              session: id,
              prompt: kept.short,
              force,
              ...(from === undefined ? {} : { from }),
              ...(noFrom ? { noFrom } : {}),
            },
            outputs: (r) => ({ chars: r.chars, from: r.from }),
          },
          () =>
            sendPrompt({ store, tmux, clock: deps.clock, caller }, id, prompt, {
              force,
              from,
              noFrom,
            }),
        );
      },
      /**
       * Adopts a Claude Code session Mesa did not start: a record for it, and, unless
       * `noResume`, its conversation reopened in a Mesa window. Its warning is always said.
       */
      adopt: (
        agentSessionId: string,
        opts: { project?: string; name?: string; noResume?: boolean } = {},
      ) =>
        record(
          {
            type: 'session',
            summary: ({ record: r }) =>
              `Adopted Claude Code session ${agentSessionId} as ${r.id} on ${r.project}`,
            failure: `Could not adopt Claude Code session ${agentSessionId}`,
            project: (r) => r.record.project,
            session: (r) => r.record.id,
            agent: (r) => r.record.agent,
            inputs: { agentSessionId, ...opts },
            outputs: ({ record: r }) => ({
              window: r.tmux.window,
              resumed: !opts.noResume,
              ...(r.cwd ? { cwd: r.cwd } : {}),
            }),
          },
          () =>
            adoptSession(
              {
                ...openDeps(),
                listing: () => listAgentProcesses(deps.run),
                elsewhere: otherProfilesSessions,
                transcripts: claudeTranscripts(deps.home),
              },
              { agentSessionId, ...opts },
            ),
        ),
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
        ).then((recorded) => {
          const { warning } = recorded.result;
          const joined = [recorded.warning, warning].filter(Boolean).join('; ');
          return markEnded(
            { ...recorded, ...(joined ? { warning: joined } : {}) },
            recorded.result.from,
          );
        }),
      /** Sizes a session's window to a view now (the app's terminal, after each fit). */
      resize: (id: string, cols: number, rows: number) =>
        resizeSession({ store, tmux }, id, cols, rows),
      /** Attaches to a live session: here (the argv to exec), or in config `terminal.app`. */
      attach: (id: string, app = false) =>
        attachSession(
          {
            store,
            tmux,
            run: deps.run,
            scripts: paths.attachScripts,
            env: deps.env,
            viewId: () => deps.newId().slice(-8).toLowerCase(),
          },
          id,
          app ? open().config.terminal.app : undefined,
        ),
    },
    hooks: {
      /** Both kinds of hook: Claude Code's in its settings, and the pane-died one on Mesa's server. */
      status: async () => ({ ...hooksStatus(deps.home, deps.self), tmux: await tmuxHook() }),
      /** Adds Mesa's entries to ~/.claude/settings.json; running it twice leaves one per event. */
      install: () =>
        record(
          {
            summary: () => "Installed Mesa's Claude Code hooks",
            failure: "Could not install Mesa's Claude Code hooks",
            inputs: {},
            outputs: (r) => ({ path: r.path }),
            changed: (r) => r.changed,
          },
          () => installHooks(deps.home, deps.self),
        ),
      uninstall: () =>
        record(
          {
            summary: () => "Removed Mesa's Claude Code hooks",
            failure: "Could not remove Mesa's Claude Code hooks",
            inputs: {},
            outputs: (r) => ({ path: r.path }),
            changed: (r) => r.changed,
          },
          () => uninstallHooks(deps.home, deps.self),
        ),
    },
    /** One agent hook's payload, from `mesa hook claude` inside a Mesa session. */
    hookEvent: (agent: string, payload: string) =>
      recordHookEvent(
        {
          store,
          eventsDir: paths.events,
          clock: deps.clock,
          home: deps.home,
          secrets: secretsOrRefuse,
        },
        { agent, mesaSessionId: windowId(deps.env), payload },
      ),
    /** tmux's pane-died hook: the agent in a Mesa window exited (`mesa hook tmux pane-died`). */
    paneDied: (project: string, window: string) =>
      recordPaneDied({ store, tmux, clock: deps.clock }, project, window),
    /** The windows on the profile's tmux server, or one project's. */
    windows: (project?: string) => tmux.listWindows(project),
    /**
     * Faro, for questions from outside (mesa decide): no rules know them, so the rules backend
     * answers evenly. Decision sites bring their own rules backend.
     */
    decide: (state: unknown, questions: unknown) =>
      // decide validates what it is given: this is the boundary it checks.
      decide(
        { backends: FARO_BACKENDS, profile: faroProfile(), clock: deps.clock },
        state,
        questions as Question[],
      ),
    doctor: () => {
      const profileNow = faroProfile();
      const named = profileNow.decisions.backend;
      const active = selectBackend(FARO_BACKENDS, profileNow).name;
      const decisions = configIfAny() && {
        named,
        active,
        threshold: profileNow.decisions.threshold,
      };
      return runDoctor({
        run: deps.run,
        obsidian: deps.obsidian,
        profileDir: paths.root,
        decisions,
        hooks: { claude: () => hooksStatus(deps.home, deps.self), tmux: tmuxHook },
      });
    },
  };
}

export type Mesa = ReturnType<typeof createMesa>;
