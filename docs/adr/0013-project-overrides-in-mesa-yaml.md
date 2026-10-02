# ADR-0013: A project's overrides of profile settings live in its mesa.yaml

Status: accepted
Date: 2026-10-01

## Context

Issue #373 lets a project override the profile's worktree settings (`base`, `fetch`, `carryIgnoredDirectories`, `sparseDirectories`, `setup`, `teardown`) and terminal theme, as Xirp's Projects settings do. Mesa keeps those per profile in `config.yaml` (`worktrees`, `terminal.theme`). A project's own state lives in two places: its `mesa.yaml`, which sits in the repository and is often committed, and the profile's `registry.yaml` entry, which is local to the machine (label, pin, hide, visits). Once projects carry overrides in one of them, moving them is a migration for every user, so the choice is hard to reverse.

## Decision

- Overrides live in the project's `mesa.yaml`, under the same names as the profile's: `worktrees.{base,fetch,carryIgnoredDirectories,sparseDirectories,setup,teardown}` and `terminal.theme`. Every one is optional; one left out is the profile's. They travel with the project, so a teammate or a second profile working on the same repository gets the same worktree policy.
- Each field has one schema, `WORKTREE_OVERRIDE_FIELDS` (`packages/core/src/worktrees/fields.ts`): the profile adds its defaults to it and the project leaves it partial, so a value valid in one file is valid in the other. Location and custom root stay profile-only: where worktrees go is the machine's business.
- `worktreeSettings(profile, dir)` (`worktrees/settings.ts`) is the one place the two merge, and every reader (creation, session launch, setup rerun, the remove preview and its teardown) takes it. A remove runs the teardown its preview showed, which the preview token covers.
- `mesa projects set <project> <path> <value> | --unset` writes one override through `setYamlPath`, which keeps the file's other keys, their order, and their comments, and drops a map an unset leaves empty. It refuses any path that is not an override.
- The project list carries `overrides` as written and `terminalTheme`, the effective theme, as it already carries `agent`.

## Evidence

- The project file is a strict schema (`projects/project-file.ts`), so an unknown or misspelled override is `invalid_config` at read, not ignored; the tests in `projects/projects.test.ts` refuse `worktrees.location`, a path outside the repository, and an unknown theme.
- `setYamlPath` already kept comments for the skills policy (`setProjectSkills`); the round trip in `projects.test.ts` writes three overrides into a commented file, unsets them, and gets the original bytes back.
- Profile setup and teardown already run as an argv without a shell (CONTEXT.md, Worktree), and only on an explicit worktree creation or removal; project ones run the same way.

## Consequences

- A repository's `mesa.yaml` can name a setup command that runs when a worktree of it is created, including a repository added with `mesa projects clone`. That is the trust a person already gives the repository's own scripts (a `pnpm install` runs its lifecycle scripts); Settings > Projects and `mesa projects --json` show the commands before any worktree is made.
- A profile that wants a different policy for one repository without touching the repository has no place for it; that would be a registry field, added beside these, not instead of them.
- Removing a field later breaks every `mesa.yaml` that sets it, as the schema is strict: a removal needs a deprecation that accepts and ignores it first.
