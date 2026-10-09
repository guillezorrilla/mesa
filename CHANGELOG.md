# Changelog

Each version's changes, newest first. `pnpm release:version` writes a version's section from the pull request titles, and the release publishes it as its notes ([docs/release.md](docs/release.md)).

## 0.3.0 - 2026-10-09

### Features

- **tickets**: name Jira in the Tickets tab's setup, and move Vault after Files (#707)

## 0.2.3 - 2026-10-09

### Features

- **skills**: ship agent-guidelines, on by default, with a Settings switch (#705)
- **vault**: re-capture a session's newer messages, capture background sessions, and build capture input in vault/capture (#704)
- **vault**: capture session decisions at session end, and nudge agents to ask the Decision model (#697)
- **sources**: redesign the Tickets tab around a ticket panel, and assign a ticket when a session starts from it (#698)
- **sources**: a Tickets tab that lists a project's followed Jira views and starts sessions from them (#694)

### Fixes

- **sessions**: a finished turn with background work reads idle, not working (#701)
- **app**: a session's background read of a replaced notice no longer toasts (#700)
- **app**: declutter the usage dialog and show priced costs instead of Unknown (#696)

## 0.2.2 - 2026-10-09

### Features

- **app**: create, switch and manage profiles from the app (#688)

### Fixes

- **notifications**: the Inbox keeps one notice per session, its newest, raises none when a subagent finishes, and marks a session's notice read when you open it (#690)
- **sessions**: a click in empty space puts the keyboard back in the open session (#689)

## 0.2.1 - 2026-10-08

### Fixes

- **sessions**: a session starts in a project whose untracked mesa.yaml went missing, writing a minimal one back instead of failing with "no mesa.yaml" (#684)
- **projects**: right-click a project in the sidebar for the same actions as its menu: rename, pin, hide, reorder, unregister (#684)
- **projects**: unregistering the project in view opens the nearest one in the sidebar instead of Sessions (#684)
- **sessions**: a collapsed Sessions folder expands when a new session appears in it (#684)
- **app**: Review > Responses shows two lines of each response and opens its review in place under it (#684)

## 0.2.0 - 2026-10-08

### Features

- **decisions**: smarter decisions with your own Jev (TypeSafe) or CLEF (Cloudflare Workers AI) key, kept in the Keychain. With no key, sessions run exactly as before (#669, #670)
- **sessions**: Claude Code and Codex get the most relevant project notes for each prompt, and can ask for a next step or check evidence through in-session tools (#672, #673)
- **decisions**: each automatic use is turned on only after paired workflows show it makes sessions finish more often or faster: prompt advice for Jev and CLEF, Board placement for CLEF (#671, #674, #681)
- **app**: Settings > Smarter decisions connects a model in a few clicks and shows how each use performed (#670, #674)
- **app**: prompt to update Mesa's hooks when they are out of date or a key needs them (#680)
- **search**: fuzzy palette ranking and a session switcher (#668)

### Fixes

- **core**: the browser entry reaches no Node built-in, so pnpm dev loads the app (#667)

### Other

- **readme**: the all-in-one workspace and the new decision models (#676)
- **app**, **sessions**, **core**: app, CLI and core structure reorganised by domain (#663, #664, #665, #666)

## 0.1.7 - 2026-10-06

### Features

- **app**: the terminal edits the line like macOS terminals: Cmd+Left/Right jump to its start or end, Cmd+Backspace deletes it, Option+Left/Right move by word (#661)
- **app**: Shift+Enter inserts a newline by default (#657)

### Fixes

- **app**: switching sessions puts the keyboard in the new session's terminal (#653)
- **app**: sidebar sessions stay in the order they were opened (#655)
- **app**: no beep on Cmd+C after a drag copies from the terminal (#659)

## 0.1.6 - 2026-10-06

### Features

- **sessions**: a session's state files recover from a crash: a lock left by a dead process is taken over, and a retried write keeps one receipt (#640, #642, #644)

### Fixes

- **sessions**: tmux windows, worktrees and file writes recover from a crash midway (#646)
- **sessions**: one resume per conversation, even when started twice (#645)
- **sessions**: a new session's terminal shows its own window (#635)
- **agents**: read Claude transcripts and settings from CLAUDE_CONFIG_DIR (#636)
- **usage**: agent labels and usage types come from core, the same in the CLI and the app (#600)

### Breaking changes

- **instructions**: agent instruction files moved from rules to instructions: `mesa rules` is now `mesa instructions list|read|write`, and the app's Rules tab is Instructions. `mesa rules` exits with a pointer to the new name (#601, #637)

### Other

- **release**: one update installer, through the app (#602)
- **core**: dependency injection cleanup: the command runner carries an injected environment, and modules take only what they use (#649, #650)

## 0.1.5 - 2026-10-05

### Features

- **app**: a new first run that goes from choosing a vault to a running session: pick an Obsidian vault or create one, install what sessions need, choose your projects, and start your first session (#588)
- **doctor**: install a missing tmux, Claude Code or Codex from the app with one click, through Homebrew (#587)

### Fixes

- **app**: show expected absences as empty states instead of error banners, and lay out the vault when the profile is created (#584)
- **app**: drop confirmation banners the screen already shows (#583)
- **sessions**: scroll a session's terminal one line per row of wheel travel (#579, #580)

## 0.1.4 - 2026-10-05

### Features

- **app**: fill the context ring on its own and open context use on click (#570)

### Fixes

- **vault**: describe the vault read tools as on-demand, not first (#574)
- **app**: focus the agent's terminal when a session opens or is selected (#573)
- **sessions**: show the name a session got in Claude Code instead of its id (#568)

## 0.1.3 - 2026-10-05

### Features

- **app**: sort projects by name by default, remember the sort, never reorder on select (#564)

### Fixes

- **sessions**: widen Find from sessions, one scroll, readable running session names (#565)
- **app**: drop Faro and decisions from the tour (#563)

### Other

- **docs**: say in the README that features ship only if they beat plain agents (#556)
- **spikes**: audit transcripts for knowledge lost between sessions (#557)

## 0.1.2 - 2026-10-05

### Features

- **app**: honest roles and keyboard multi-select in the Sessions tab (#512) (#550)
- **app**: explain or adopt running sessions discovery cannot tick (#510) (#549)
- **app**: show sessions where a project is additional on that project's views (#548)
- **app**: show first-run discovery before the tour (#546)
- **release**: write release notes and CHANGELOG from typed PR titles (#518)

### Fixes

- **sessions**: quality pass over P13 (#537) (#553)
- **sessions**: cut the bytes mesa discover reads, scan once per Add to Mesa run (#551)
- **sessions**: one partial-failure exit for bulk commands, adopt worktree conversations under their project (#547)
- **sessions**: start Codex --with sessions with the workspace-write sandbox (#515) (#544)
- **sessions**: check every repo for git blockers before rm across projects (#543)

### Performance

- **sessions**: read a Claude Code name from the last 1 MiB of its transcript (#513) (#542)

### Other

- **readme**: describe P13 multi-project and discovery changes (#552)
- **sessions**: move new-session record creation out of launch.ts (#545)
- **readme**: drop Faro, add discovery, multi-project sessions and bulk archive (#519)

## 0.1.1 - 2026-10-04

### Features

- **sessions**: list native projects and recent conversations machine-wide (#502)
- **sessions**: select several sidebar sessions and archive them together (#503)
- **sessions**: start one session across several projects with `mesa open --with` (#504)
- **sessions**: offer discovery on first run and adopt recent sessions in bulk (#505)
- **sessions**: queue, fork and remove sessions across several projects (#506)
- **sessions**: count additional projects in the board, pull requests, goals and search (#507)
- **app**: start a session from the empty composer without a first message (#493)

### Fixes

- **sessions**: refuse a `/goal` goal where the agent cannot run `/goal` (#501)

### Other

- **decisions**: decide with rules only by default, dropping the slower model adapter (#491)
- **sessions**: clean up the multi-project and discovery code (#516)
- **docs**: lead the README with what Mesa gives you (#483)
- **docs**: explain what Faro gives you and link its docs (#486)

## 0.1.0 - 2026-10-03

First stable release. See [Mesa 0.1.0](https://github.com/guillezorrilla/mesa/releases/tag/v0.1.0).
