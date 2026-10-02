# ADR-0015: The app's source is grouped by domain: app, features, components, lib

Status: accepted
Date: 2026-10-01

## Context

`apps/desktop/src` had grown to 185 files with no rule for where one goes. `screens/` held 40 loose files (every Git panel, every Files part, the project view and its tabs) beside eight sub-folders; `components/` mixed domain-free pieces (ActionDialog, IconButton) with ones only one screen used (Terminal, CanvasView, FileEditor); `lib/` mixed the client with app-shell hooks. Names followed three conventions at once (`terminal-input.ts`, `fixedShortcuts.ts`, `ProjectWorkspace.tsx` beside `FilesWorkspace.tsx` and `WorktreesSection.tsx` for the same kind of thing). `App.tsx` (840 lines), `SessionsScreen.tsx` (1044) and `lib/client.ts` (1147) each owned several jobs. The owner asked for a structure that scales and makes things easy to find.

## Decision

```
src/
  main.tsx            the entrypoint: the only file that picks the real bridge and platform (ADR-0008)
  style.css           Tailwind entry and theme tokens (ADR-0009)
  app/                the window shell: layout, title bar, sidebar, navigation, app-wide effects
  features/<domain>/  one folder per domain: its screens, tabs, dialogs, menus, hooks, helpers, tests
  components/         domain-free shared components used by two or more features
  components/ui/      shadcn/ui primitives, as the shadcn CLI writes them
  lib/                cross-cutting infrastructure: the mesa client, MesaRoot, platform, tauri, shared hooks
```

- **Where a file goes.** A file used by one domain lives in that domain's folder. It moves to `components/` (UI) or `lib/` (logic) only once a second domain needs it and it knows nothing of either domain. A feature folder with more than about 15 files groups its parts into sub-folders by kind (`features/sessions/dialogs/`, `review/`, `fields/`).
- **Domains.** `sessions` (the Board, Grid, a session's panels), `projects` (the project screen and adding projects), `files`, `git`, `worktrees`, `rules`, `skills`, `vault`, `map`, `daily`, `doctor`, `help`, `notifications`, `settings`, `usage`, `prompts`, `backup`, `tour`, `search`, `profile`, `terminal`. A new domain is a new folder; words follow `CONTEXT.md`.
- **Names.** A component file is PascalCase and exports one component of that name. A hook is `useThing.ts`. Any other module is camelCase (`gitChanges.ts`, `terminalInput.ts`). `components/ui/` keeps shadcn's kebab-case so `shadcn add` and diffs against upstream stay clean. Tests sit beside what they test as `<Name>.test.ts(x)`.
- **Suffixes say what a component is.** `Screen` is a view the sidebar navigates to; `Tab` is one tab of the project screen; `Dialog` is a modal; `Menu` is a dropdown or popover; `Panel` is a pane inside a screen; `Field` is one form control with its label.
- **Imports.** Inside one feature folder (or inside `app/`, `components/`, `lib/`), imports are relative. Across them they use the `@/` alias. A feature may import `components/`, `lib/`, and another feature's exported component or helper; `components/` and `lib/` never import a feature.
- **Size.** A component file stays under about 300 lines, with one job. Past that, its sub-components, its effects (as `useThing` hooks), and its pure helpers move to their own files in the same folder.

## Evidence

The move (commit `desktop: group src into app, features, components and lib`) changed no behaviour: `pnpm -C apps/desktop typecheck` clean and all 241 desktop tests passing before and after, with only import lines and the five `*Workspace` to `*Tab`/`ProjectScreen` renames in the diff.

## Consequences

- ADR-0009's "a screen with several parts gets a folder" becomes "every domain gets a folder"; its `components/` list is now the domain-free set (ActionDialog, CountPill, IconButton, MarkdownView, Muted, PageHeader, SectionLabel, SegmentedControl, Toast).
- A new app command still lands as one entry in the client's command table (ADR-0008), now in the file for its domain under `lib/client/`.
- Moving a file is cheap across folders (the `@/` import does not change when the importer moves), so a file that outgrows its folder moves with the PR that makes it shared.
