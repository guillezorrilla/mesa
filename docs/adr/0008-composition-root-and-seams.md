# ADR-0008: Mesa is composed at one root; modules take their dependencies

Status: accepted
Date: 2026-09-24

## Context

A codebase-design review of P0 and the first P1 issues (issue #54) found core functions reading `os.homedir()`, `process.env`, `process.cwd()`, `new Date()`, and `execFile` as hidden defaults. Several modules had more than one job (config.ts did YAML IO, validation, the schema, profile bootstrap, and redaction), and knowledge was duplicated: profile paths in three files, per-command arity checks, and a parallel command table in the app. No CLI command could be tested without the real home directory, and a review agent wrote a profile into it by mistake. The owner asked for clean, atomic, testable, injected, single-responsibility, and reusable code before P1 continued.

Three shapes were compared: explicit dependencies on every call (wide interfaces), a composition root with small single-purpose modules (chosen), and classes with a container (the same seams, more ceremony).

## Decision

- `createMesa(profile, deps)` in `packages/core/src/mesa.ts` is the composition root. It builds every service for one profile from `MesaDeps = { home, cwd, clock, newId, env, run, obsidian, argv }`. Core modules accept what they need as parameters; they never read process globals. A seam joins `MesaDeps` with its first consumer: the clock arrived with the vault log (#11), the environment with receipt redaction of `env:` key values (#13).
- Only entrypoints pick the real implementations: `packages/cli/src/mesa.ts` (homedir, cwd, `MESA_PROFILE` from env, `execRunner`, `macObsidianPaths(home)`), `apps/desktop/src/main.tsx` (`tauriBridge`), and the Rust `run_mesa` command (the `MESA_CLI` override).
- Seams follow the dependency type. The filesystem stays real and the seam is the injected home (tests use temp dirs). The process runner, the clock, and the id source are seams, each with a real implementation and a controlled one (`scriptedRunner`, `fixedClock`, `sequentialIds`). The app has a `Bridge` seam, the Tauri `invoke` or a fake: `MesaRoot` builds the client over it and supplies it, with the toasts, to every screen; tests swap the bridge, never the client.
- Test implementations live in `packages/core/src/testing/index.ts` (`@mesa/core/testing`): `scriptedRunner`, `testDeps`, `tempDir`, `thrown`. The app has `renderWithMesa` and `fakeBridge`. Tests swap implementations at a seam; they do not mock Mesa's own modules. ("Adapter" is avoided here because it names a decisions backend.)
- One module per job in core (`agents`, `yaml-file`, `paths`, `profile`, `config`, `project-file`, `registry`, `projects`, `process`, `clock`, `ids`, `frontmatter`, `atomic-file`, `vault-lock`, `notes`, `vault`, `receipt-file`, `receipts`, `obsidian`, `doctor`, `mesa`). The package index exports only the composition root, the real implementations, the result envelope, the data types callers render, `resolveProfileName`, and the agent names. Agent names and install hints come from one `AGENTS` table. In the CLI, one file per command group under `commands/`, declared with `defineCommand`: positional `args`, typed and required flags, and multi-word names such as `config set` are data, and `runCli` derives arity checks, usage lines, and help from them.
- `mesa doctor --json` returns `{ healthy, summary, checks }` with a `status` per check (`ok`, `warn`, `fail`), so the health rule and its wording live in core only; the CLI and the Doctor screen render them.
- Functions that need an initialised profile take a `Profile`, a branded type only `openProfile` makes, so the type is the proof that `mesa init` ran.

## Evidence

Issue #54 and its review. After the change, `grep -rnE 'process\.(env|cwd)|homedir\(|new Date\(' packages/core/src` matches only a comment in `process.ts`. `packages/cli/src/commands.test.ts` runs every command end to end against a temp home.

## Consequences

- A new core capability is a module that takes its dependencies as parameters, plus one line in `createMesa`. A new command is a `defineCommand` in `commands/` and one entry in `commands/index.ts`. A new app command is one entry in `apps/desktop/src/lib/client.ts`.
- Help, usage lines, and text tables are derived, so their layout follows the declarations rather than hand-written strings.
- Changing a dependency means changing `MesaDeps` and the CLI entrypoint that builds it; tests pick it up through `testDeps`.

## Amendment, 2026-09-26: one service factory per domain

A codebase review (issues #101 to #106) found `createMesa` at 554 lines holding rules as well as wiring: ten receipt specs, the goal read, `markEnded`, a scan of other profiles' files, Faro's wiring, and the doctor's summary. "One line in `createMesa`" per capability no longer held.

- `createContext(profile, deps)` (`packages/core/src/context.ts`) builds what every domain shares for one profile: its paths, the config readers, the secrets receipts redact, the receipt recorder, the session store, and the tmux backend. `MesaDeps` lives there and is now `{ home, cwd, clock, newId, newUuid, self, sleep, env, run, obsidian, argv }`.
- Each domain builds its own services over that context, receipts included: `profile/service.ts`, `projects/service.ts`, `vault/service.ts`, `receipts/service.ts`, `agents/claude/hooks-service.ts`, `sessions/service.ts`, and `decisions/faro.ts` (the shared backends, the profile's view of them, `decide`, and what doctor shows).
- `createMesa` only composes them (41 lines) and holds no rule. A new capability is a function in its domain plus an entry in that domain's service; `createMesa` changes only for a new domain.
- Core is laid out by domain (`lib/`, `profile/`, `vault/`, `receipts/`, `projects/`, `agents/`, `decisions/`, `sessions/`, `testing/`), and each shared concept has one owner (AGENTS.md, Code shape).
- In the CLI, a command lives in the file named for its first word (`hooks install` in `commands/hooks.ts`, `hook tmux` in `commands/hook.ts`), and `commands/index.test.ts` checks it. A recorded action's output goes through `recordedOutput` (`output/recorded.ts`), which joins its own warning and its receipt's into one `warning`; command tests run on `cliHarness` (`src/testing.ts`), one file per domain.
