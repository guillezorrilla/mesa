# Change files

Each user-visible pull request adds one file here, `changes/<slug>.md`, with the note people read in Mesa's Notifications menu ("What's new in vX.Y.Z"), in `mesa whats-new` and in the release notes. `pnpm release:version` collects the files into the version's section of `CHANGELOG.md` under Added, Changed and Fixed, with the pull request number found from the commit that added each file. A stable release deletes them; a beta keeps them, so the stable release lists everything (docs/release.md).

The file is front matter with one field, `type`, then the note as one paragraph: one or two sentences, written for the person using Mesa, saying what they can now do or what works now. Name the feature, then say what it does. No area labels, no pull request numbers, no em dashes.

| `type` | Badge in the app | For |
| --- | --- | --- |
| `added` | NEW | something people can do that they could not before |
| `changed` | CHANGED | something that works differently, faster, or no longer exists (breaking changes too) |
| `fixed` | FIXED | something that was broken and now works |

A `feat`, `fix` or `perf` pull request without a change file fails the `pr-title` check unless it has the `no-release-note` label, for changes people never see.

## Examples

`changes/minimap-recency.md`:

```md
---
type: added
---

Recency grouping in the minimap: the minimap's Group by menu adds a Recency option that buckets sessions by last activity.
```

`changes/board-open-speed.md`:

```md
---
type: changed
---

The Session Board opens faster with many sessions, as it reads each session's state once instead of on every redraw.
```

`changes/terminal-focus.md`:

```md
---
type: fixed
---

Switching sessions puts the keyboard in the new session's terminal, so you can type right away.
```
