import { resolve } from 'node:path';
import type { Clock } from './clock.js';
import { redactConfig, resolveKey, setConfigValue } from './config.js';
import { type ObsidianPaths, runDoctor } from './doctor.js';
import type { IdSource } from './ids.js';
import { logLine } from './notes.js';
import { profilePaths } from './paths.js';
import type { Env, Runner } from './process.js';
import { initProfile, openProfile, type ProfileInfo } from './profile.js';
import { listProjects, registerProject, unregisterProject } from './projects.js';
import {
  actionRecorder,
  DEFAULT_RECEIPT_LIMIT,
  listReceipts,
  redactCommand,
  showReceipt,
} from './receipts.js';
import { initVault, vaultStatus } from './vault.js';

/** Everything Mesa takes from the outside world. Only an entrypoint builds the real one. */
export type MesaDeps = {
  home: string;
  /** Resolves relative paths the user types. */
  cwd: string;
  clock: Clock;
  newId: IdSource;
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
  const record = actionRecorder({
    profile,
    vault: () => configIfAny()?.vault,
    clock: deps.clock,
    newId: deps.newId,
    command: () => {
      const config = configIfAny();
      const names = Object.keys(config?.keys ?? {});
      // Both the stored values and what env: references resolve to are secrets.
      const secrets = names.flatMap((n) => [
        config?.keys[n],
        config && resolveKey(config, n, deps.env),
      ]);
      return redactCommand(
        deps.argv,
        secrets.filter((s): s is string => typeof s === 'string'),
      );
    },
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
    },
    log: (text: string) => logLine(notes(), text),
    receipts: {
      list: (limit = DEFAULT_RECEIPT_LIMIT) => listReceipts(vaultOf(), limit),
      show: (id: string) => showReceipt(vaultOf(), id),
    },
    doctor: () => runDoctor({ run: deps.run, obsidian: deps.obsidian, profileDir: paths.root }),
  };
}

export type Mesa = ReturnType<typeof createMesa>;
