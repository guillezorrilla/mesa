# ADR-0013: A project's overrides of profile settings live in its mesa.yaml

Status: accepted
Date: 2026-10-01

## Context

Issue #373 lets a project override the profile's worktree settings (`base`, `fetch`, `carryIgnoredDirectories`, `sparseDirectories`, `setup`, `teardown`) and terminal theme, as Xirp's Projects settings do. Mesa keeps those per profile in `config.yaml` (`worktrees`, `terminal.theme`). A project's own state lives in two places: its `mesa.yaml`, which sits in the repository and is often committed, and the profile's `registry.yaml` entry, which is local to the machine (label, pin, hide, visits). Once projects carry overrides in one of them, moving them is a migration for every user, so the choice is hard to reverse.

## Decision

- Overrides live in the project's `mesa.yaml`, under the same names as the profile's: `worktrees.{base,fetch,carryIgnoredDirectories,sparseDirectories,setup,teardown}` and `terminal.theme`. Every one is optional; one left out is the profile's. They travel with the project, so a teammate or a second profile working on the same repository gets the same worktree policy.
- Each field has one schema, `WORKTREE_OVERRIDE_FIELDS` (`packages/core/src/worktrees/fields.ts`): the profile adds its defaults to it and the project leaves it partial, so a value valid in one file is valid in the other. Location and custom root stay profile-only: where worktrees go is the machine's business.
- `worktreeSettings(profile, project)` (`worktrees/settings.ts`) is the one place the two merge, and every reader (creation, session launch) takes it. It leaves out setup and teardown, which run only through `worktreeScript`.
- **A repository's commands run only once this profile approves them.** A `worktrees.setup` or `worktrees.teardown` from `mesa.yaml` runs only when the sha256 of its exact argv matches the fingerprint stored for that script in the project's registry entry (`approved`, in `~/.mesa/<profile>/registry.yaml`, outside the repository; `worktrees/approval.ts`). Anything else is `needs_approval` (exit 10), whose message and details name each exact argv, and nothing is created or removed. `mesa projects trust <project>` approves what the file names now, with a kept guardrail receipt (`outputs.override: trusted`, and the argvs). `mesa projects set` approves the argv a person writes, and an unset or an empty list drops the approval. Settings > Projects lists unapproved scripts and approves them in a dialog that shows each argv. Any change to an argv (a pull, a branch checkout, an agent's edit) asks again. An empty list runs nothing and needs no approval. The profile's own `config.yaml` scripts need none: the person wrote them there.
- A remove runs the teardown its preview showed, which the preview token covers.
- `mesa projects set <project> <path> <value> | --unset` writes one override through `setYamlPath`, which keeps the file's other keys, their order, and their comments, and drops a map an unset leaves empty. It refuses any path that is not an override.
- The project list carries `overrides` as written and `terminalTheme`, the effective theme, as it already carries `agent`.

## Evidence

- The project file is a strict schema (`projects/project-file.ts`), so an unknown or misspelled override is `invalid_config` at read, not ignored; the tests in `projects/projects.test.ts` refuse `worktrees.location`, a path outside the repository, and an unknown theme.
- `setYamlPath` already kept comments for the skills policy (`setProjectSkills`); the round trip in `projects.test.ts` writes three overrides into a commented file, unsets them, and gets the original bytes back.
- Profile setup and teardown already run as an argv without a shell (CONTEXT.md, Worktree), and only on an explicit worktree creation or removal; project ones run the same way.
- `worktrees/settings.test.ts`, with real git: a repository added by `mesa projects clone` whose `mesa.yaml` names a setup is refused with `needs_approval` and gets no worktree; after `trust`, the setup runs; after the file changes, creation and the setup rerun are refused again and nothing runs; a setup written through `mesa projects set` runs, and an empty one runs nothing. A project teardown refuses the remove preview until trusted, then runs on removal, and a changed teardown is refused again. `packages/cli/src/commands/projects.test.ts` checks exit 10, the receipt `projects trust` keeps, and approval of a changed setup.

## Consequences

- A repository's `mesa.yaml` can name a setup or teardown, including one added with `mesa projects clone`, but cloning, pulling, or editing the file never makes Mesa run it: a person approves the exact argv first, in this profile, and approves it again after any change. `mesa projects --json` (`unapproved`) and Settings > Projects show what waits. Creating a worktree before approval is refused, so a person sees the command before it runs.
- Approval is per profile and per argv, not per repository: a second profile, or a second machine, asks again. A command that is safe as an argv can still run the repository's own code (`pnpm install` runs lifecycle scripts); approving it trusts that code, as running it by hand would.
- An agent with shell access in the profile can still run `mesa projects trust` or `mesa projects set`; the approval stops a file change from running silently, not a caller that already runs commands as the person.
- A profile that wants a different policy for one repository without touching the repository has no place for it; that would be a registry field, added beside these, not instead of them.
- Removing a field later breaks every `mesa.yaml` that sets it, as the schema is strict: a removal needs a deprecation that accepts and ignores it first.
