# Spike: the Obsidian CLI from a child process, and live refresh

Issue: #15. Date: 2026-09-25. macOS (Darwin 25.6.0), Obsidian 1.13.7 (installer 1.12.7), Mesa at `81dfecc`. Two sessions: the spike itself, and a second one run for #16's test plan (`mesa vault open` against a second throwaway vault, `$HOME/mesa-open-vault`), whose findings are folded in here and marked "(second session)".

Everything ran against a throwaway vault, `$HOME/mesa-spike-vault`, laid out by `mesa vault init` from a temp-HOME profile and filled with invented notes. The owner's own vaults were never targeted: every command names `vault=mesa-spike-vault`, because the CLI's default is the most recently focused vault. Outputs below are verbatim except that the home directory is shown as `$HOME` and the owner's vault names are left out. Screenshots were taken of Obsidian's window only and deleted afterwards.

Codex is not involved; nothing here is agent-specific.

## Enabling the CLI

- Obsidian Settings, General, toggle "Command line interface", then follow the registration prompt (admin rights). On this machine that was done on 2026-09-24.
- The result is a symlink: `/usr/local/bin/obsidian -> /Applications/Obsidian.app/Contents/MacOS/obsidian-cli`.
- `obsidian version` prints `1.13.7 (installer 1.12.7)`. The bundle's Info.plist (`CFBundleShortVersionString`), which `mesa doctor` reads so it never launches the app, holds the installer version, `1.12.7`, not the running app's.
- `obsidian help` lists 100+ commands. `format=json` exists on `search`, `search:context`, and the list commands such as `tags` and `tasks`. The issue asks for `format=json` output for vault list, search, read, and daily, but only `search` takes it: `vaults`, `vault`, `files`, `folders`, `read`, and the `daily:*` commands have no format option and print text (tab-separated for `vault`, one path per line for `vaults`, `files`, and `folders`, the raw note for `read`). Their text output is recorded below instead.
- The CLI finds the running app through `HOME`: `HOME=<another dir> obsidian version` prints the "unable to find Obsidian" line although the app is running (second session).

## Output, app running

Each call returns in about 35 ms.

```text
$ obsidian vaults total
3                                    # the owner's two vaults and the spike vault; names omitted
$ obsidian vault=mesa-spike-vault vault
name	mesa-spike-vault
path	$HOME/mesa-spike-vault
files	7
folders	7
size	2635
$ obsidian vault=mesa-spike-vault files
AGENTS.md
daily/2026-09-25.md
index.md
log.md
receipts/2026/09/20260925T170420Z-action-01M3CRCVET1KGSRKZ80VNA1MMY.md
receipts/2026/09/20260925T170421Z-action-01M3CRCVJAWFQ61E4YBARDN5QK.md
wiki/harbor-lights.md
$ obsidian vault=mesa-spike-vault folders
/
daily
projects
raw
receipts
receipts/2026
receipts/2026/09
wiki
$ obsidian vault=mesa-spike-vault search query=lighthouse format=json
["wiki/harbor-lights.md"]
$ obsidian vault=mesa-spike-vault search:context query=lighthouse format=json
[{"file":"wiki/harbor-lights.md","matches":[{"line":6,"text":"An invented note about a lighthouse keeper named Ada."}]}]
$ obsidian vault=mesa-spike-vault read path=wiki/harbor-lights.md
---
tags: [spike]
---
# Harbor Lights

An invented note about a lighthouse keeper named Ada.
$ obsidian vault=mesa-spike-vault daily:path
2026-09-25.md
$ obsidian vault=mesa-spike-vault daily:read
                                     # empty output, exit 0
$ obsidian vault=mesa-spike-vault reload
Reloading...
```

Two findings in that block:

- **Obsidian's daily note is not Mesa's.** The Daily notes plugin defaults to the vault root (`daily:path` is `2026-09-25.md`), while `mesa log` writes `daily/2026-09-25.md`.
- **`daily:read` writes.** With no root daily note, `daily:read` printed nothing and created an empty `2026-09-25.md` at the vault root (its birth time matched the call to the second). A read command is not safe to run on a Mesa vault.

## Focus and windows

Before each command Finder was made frontmost; the frontmost app and Obsidian's windows were read 1.2 s after it.

| Command | Frontmost after | New window |
| --- | --- | --- |
| `vaults`, `vault`, `files`, `folders`, `search`, `search:context`, `read`, `daily:path`, `daily:read`, `reload` | unchanged (Finder) | none |
| `open path=...` | unchanged (Finder) in the first session's one run; Obsidian in all 3 runs of the second session | none; the note opens in the vault's window |
| `open "obsidian://open?vault=mesa-spike-vault&file=..."` | Obsidian | none; the vault's window shows the note |
| `open "obsidian://open?path=<folder not yet a vault>"` | Obsidian | a modal "Vault not found. Unable to find a vault for the URL obsidian://open?path=..." |

The read commands never stole focus. The CLI's `open` did in 3 of 4 runs, so it cannot be relied on to stay in the background. The URIs always bring Obsidian to the front, which is what `mesa vault open` wants.

## Obsidian closed

After `osascript -e 'quit app "Obsidian"'`, every CLI command, with or without `vault=`, printed the same line and exited 1 at once, and Obsidian did not start in the next 6 seconds:

```text
$ obsidian version; echo $?
The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.
1
```

The official page says the first command launches Obsidian; on 1.13.7 through the registered symlink it does not. A URI does: `open "obsidian://open?vault=mesa-spike-vault"` with the app closed launched it straight into that vault, the window titled `New tab - mesa-spike-vault - Obsidian 1.13.7` 2.2 s later.

A fresh launch through `open` takes the caller's environment (second session): when `mesa vault open` ran under a temporary `HOME` with the app closed, the Obsidian it launched had that `HOME` (`ps eww`), and the CLI, run with the real `HOME`, could not reach it until Obsidian was restarted normally. With the real `HOME`, as in normal use, this does not arise.

## Registering a vault

Neither the CLI nor a URI can add a vault to Obsidian's list. `obsidian://open?path=<folder>` on an unregistered folder shows the "Vault not found" modal. For the spike the vault was added to `~/Library/Application Support/obsidian/obsidian.json` with the app closed (`{"vaults": {"<16 hex id>": {"path": ..., "ts": ...}}}`); the user-facing way is Obsidian's "Open folder as vault". A newly opened vault gets a `.obsidian/` folder from Obsidian, and Obsidian keeps a per-vault state file `<id>.json` next to `obsidian.json`. There was no trust prompt for a vault without community plugins.

## Live refresh

Notes written by Mesa's own `writeNote` (packages/core/dist/notes.js), one in `wiki/` and one in a new folder `wiki/new-folder-N/`, three times each, with the vault open in Obsidian. The script polled the running app through the CLI every 50 ms, up to 5 s.

| Run | Written | In `files` | In `folders` | Found by `search` |
| --- | --- | --- | --- | --- |
| note 1 `wiki/live-1.md` | 9 ms | 75 ms | | 19 ms |
| folder 1 `wiki/new-folder-1/live.md` | 5 ms | 74 ms | 8 ms | 8 ms |
| note 2 `wiki/live-2.md` | 5 ms | 84 ms | | 15 ms |
| folder 2 `wiki/new-folder-2/live.md` | 6 ms | 92 ms | 10 ms | 12 ms |
| note 3 `wiki/live-3.md` | 6 ms | 93 ms | | 10 ms |
| folder 3 `wiki/new-folder-3/live.md` | 6 ms | 93 ms | 13 ms | 10 ms |

(`search` is measured after `files` and `folders`, from the moment the note was written; all times are well under 5 s.) Every note and folder appeared without a reload, and the file explorer and the Properties panel showed them. The Properties panel renders `writeNote`'s frontmatter: `created` and `updated` as text (ISO with milliseconds is not read as a date), `source`, and `tags` as tags. The daily note's `date: 2026-09-25` is typed as a Date, with the calendar icon (second session). A receipt shows its flat fields as text properties, `decisions: []` as an empty list, and the nested `inputs` and `outputs` as raw JSON with Obsidian's unknown-type icon.

## URI forms

| URI | Result |
| --- | --- |
| `obsidian://open?vault=mesa-spike-vault` | opens the vault (launching Obsidian if it is closed) |
| `obsidian://open?vault=mesa-spike-vault&file=wiki%2Fharbor-lights` | opens the note; `.md` may be left out |
| `obsidian://open?vault=mesa-spike-vault&file=daily%2F2026-09-25.md` | opens the note with the extension given |
| `obsidian://open?path=%2FUsers%2F...%2Fmesa-spike-vault%2Fwiki%2Flive-1.md` | opens the note by absolute path, in whichever registered vault holds it |
| `obsidian://open?vault=mesa-spike-vault&file=wiki%2Fdoes-not-exist` | a toast `File "wiki/does-not-exist" not found.`; the previous note stays; `open` still exits 0 |
| `obsidian://open?path=<folder that is not a registered vault>` | the "Vault not found" modal |
| `obsidian://open?vault=no-such-vault-7f3a` (second session) | the same native alert: "Vault not found. Unable to find a vault for the URL obsidian://open?vault=no-such-vault-7f3a", a separate 260 by 234 window above the vault's |

While that alert is up, the app answers nothing: `obsidian version` and `dev:screenshot` do not return, and `osascript -e 'quit app "Obsidian"'` fails with "User canceled" (-128), until the alert's OK is clicked.

`vault=` is the vault's folder name. Values are URI-encoded (`/` as `%2F`).

## Recommendation

`mesa vault open [note]`:

- Default method: `open "obsidian://open?vault=<folder name>&file=<vault-relative path>"` (vault only when no note is given). It launches Obsidian when needed and brings it to the front.
- Mesa checks the note exists before opening (`not_found` otherwise), because a missing file only shows a toast and the URI still succeeds.
- A vault Obsidian does not know yet shows the "Vault not found" alert for both `vault=` and `path=` URIs, and the alert blocks the app until it is dismissed. Mesa can tell ahead of time by reading `obsidian.json` (read-only) and, if the vault path is not listed, print how to add it ("Open folder as vault" in Obsidian) instead of opening a dialog. Two registered vaults with the same folder name make `vault=` ambiguous; `open?path=<absolute file path>` avoids that for a note.
- `--cli`: `obsidian vault=<name> open path=<path>` when doctor reports the CLI registered. It opens the note in the vault's window and, in most runs, brings Obsidian forward like the URI. When the app is closed, or runs under a different `HOME`, it fails with exit 1, so `--cli` falls back to the URI, which launches it.

Reload fallback: none is needed. Files and folders written by Mesa appear in the running app within 100 ms and are searchable at once, so ADR-0006's plan to trigger a reload through the CLI is dropped. `obsidian vault=<name> reload` exists and prints `Reloading...` if it is ever wanted.

Also recommended, beyond this spike:

- Mesa never runs the CLI's `daily:*` commands on a Mesa vault: `daily:read` creates a note at the vault root. Pointing Obsidian's Daily notes plugin at `daily/` would mean writing `.obsidian/daily-notes.json`, which ADR-0006 rules out (vault init never touches `.obsidian/`), so it is left to the owner.
- `mesa doctor` reports the plist version as the installer version, or asks `obsidian version` when the app is running.
- Timestamps Obsidian can type: write `created`, `updated`, and `started` so the Properties panel and Bases read them as Date & Time (see "Checked against the Obsidian skills"), and write note-to-note references (the receipt's project, the `log.md` line for each receipt) as `[[wikilinks]]`. Both need an owner decision and an issue.
- Verification of Obsidian-facing features (#16 onward) uses `obsidian dev:screenshot` and `obsidian eval` rather than screen captures.

## Checked against the Obsidian skills

The repo's `obsidian-cli` and `obsidian-markdown` skills (`.claude/skills/`) were read against these results:

- `obsidian-cli`: "Requires Obsidian to be open", which the closed-app run confirms; `vault=<name>` goes first; `silent` keeps `create` and `append` from opening the note. It also names two tools this spike did without and later work should use: `obsidian dev:screenshot path=<file>` captures Obsidian's own view (no screen-recording permission, and nothing else on screen), and `obsidian eval code="..."` queries the app directly, for example `app.vault.getAbstractFileByPath("wiki/x.md") !== null` as a live-refresh check.
- `obsidian-markdown`, properties: Obsidian types a property as Date & Time only in the form `2024-01-15T14:30:00` (and Date as `2024-01-15`). Mesa writes `created`, `updated`, and receipts' `started` as ISO UTC with milliseconds (`2026-09-25T17:04:21.067Z`), which the Properties panel showed as text, so Bases cannot sort or filter them as dates. Nested objects (`inputs`, `outputs`) are not a property type Obsidian edits. Relationships between notes are best written as link properties (`project: "[[projects/lantern-cove]]"`), and links inside the vault as `[[wikilinks]]`, which Obsidian updates on rename. Changing Mesa's timestamp format is a contract change on every note and receipt, so it is recorded here as a recommendation for the owner, not made in this spike.

## Reproduction

1. With a temp HOME for Mesa only (the vault itself goes in the real home): `V="$HOME/mesa-spike-vault"; T=$(mktemp -d); HOME=$T mesa init --vault "$V"; HOME=$T mesa vault init; HOME=$T mesa log "invented line"`, and add an invented `wiki/harbor-lights.md`.
2. Back up `~/Library/Application Support/obsidian/obsidian.json`. Quit Obsidian (`osascript -e 'quit app "Obsidian"'`). Run `obsidian version; echo $?` to see the closed-app behaviour.
3. Add the spike vault to `obsidian.json` (a new 16-hex id with `path` and `ts`), then `open "obsidian://open?vault=mesa-spike-vault"`.
4. Run the commands in "Output, app running" with `vault=mesa-spike-vault`, making Finder frontmost before each to watch focus.
5. Run a script that calls `writeNote` from `packages/core/dist/notes.js` and polls `obsidian vault=mesa-spike-vault files`, `folders`, and `search query=<token> format=json` every 50 ms.
6. Open each URI in "URI forms" with `open "<uri>"`. Run Mesa itself with the real `HOME` when it may launch Obsidian, or the launched app inherits the temp one.

## Cleanup

Done on 2026-09-25, after each session: Obsidian quit; `obsidian.json` restored from the backup (`cmp` identical); each throwaway vault's app state file (`<id>.json`) removed; `$HOME/mesa-spike-vault`, `$HOME/mesa-open-vault`, and the temp Mesa homes deleted; Obsidian relaunched on the owner's vault, which it listed again with the owner's two vaults. Screenshots were deleted.
