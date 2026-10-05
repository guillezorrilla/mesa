# Changelog

Each version's changes, newest first. `pnpm release:version` writes a version's section from the pull request titles, and the release publishes it as its notes ([docs/release.md](docs/release.md)).

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
