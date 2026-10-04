# Changelog

Each version's changes, newest first. `pnpm release:version` writes a version's section from the pull request titles, and the release publishes it as its notes ([docs/release.md](docs/release.md)).

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
