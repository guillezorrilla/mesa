# Obsidian technical facts: verification report

Access date for all web sources: 2026-09-24.
Local machine checked: macOS, Obsidian.app installed at /Applications/Obsidian.app.
Local Obsidian version (from Info.plist CFBundleShortVersionString, GUI not opened): **1.12.7**.

---

## 1. Obsidian CLI: existence, version, install, running requirement

**Status: CONFIRMED, plan's "1.12+" assumption is ACCURATE, with one open discrepancy noted below.**

- The CLI exists officially. help.obsidian.md/cli redirects (301) to https://obsidian.md/help/cli, which is Obsidian's own help site (source repo: github.com/obsidianmd/obsidian-help).
- Official page states: **"Requires Obsidian 1.12 installer"**, minimum version 1.12.7+. It was introduced in Obsidian 1.12.0 (Early Access, reported Feb 10 2026 by secondary sources; not independently confirmed against obsidian.md/changelog because that changelog page only surfaced entries from mid-2026 onward in this session's fetch). The plan's assumption of "1.12+" matches the official minimum exactly.
- Enabling: Settings → General → toggle **"Command line interface"** → follow the registration prompt. Per-OS effect:
  - macOS: creates a symlink at `/usr/local/bin/obsidian` (requires admin privileges).
  - Windows: adds an `Obsidian.com` terminal redirector next to `Obsidian.exe` and registers PATH (requires terminal restart).
  - Linux: copies the CLI binary to `~/.local/bin/obsidian` (must be on PATH).
  - The bundle also ships a raw binary at `Contents/MacOS/obsidian-cli` inside the .app (confirmed present locally, see item 3).
- Running requirement: official text - **"Obsidian CLI requires the Obsidian app to be running. If Obsidian is not running, the first command you run launches Obsidian."** This is IPC to a running app instance, with an auto-launch fallback documented for the registered `obsidian` command.
- **Open question / discrepancy**: On this machine the CLI has never been registered (`which obsidian` → not found; no `/usr/local/bin/obsidian`, no `~/.local/bin/obsidian`). Running the raw bundled binary directly (`Contents/MacOS/obsidian-cli`) with Obsidian not running did **not** auto-launch Obsidian as the docs describe for the registered command - it printed an error and exited immediately (see item 3 for exact text). It is unconfirmed whether the auto-launch behavior belongs only to the registered wrapper/symlink, or whether the Settings toggle must be turned on first for auto-launch to work at all. Not resolved because the task forbids opening the GUI or changing settings.

Sources: https://obsidian.md/help/cli (redirected from https://help.obsidian.md/cli), accessed 2026-09-24; https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Extending%20Obsidian/Obsidian%20CLI.md, accessed 2026-09-24; local skill /Users/gzorrilla/Developer/personal/mesa/.claude/skills/obsidian-cli/SKILL.md.

---

## 2. Commands usable from Node child_process, focus/window behavior, output format

**Status: PARTIALLY CONFIRMED** (could not run `obsidian help` locally since the app is not running and the CLI is unregistered - see item 3). Comparison is local skill vs. official page only.

Official command categories (obsidian.md/help/cli): General, Bases, Bookmarks, Command Palette, Daily Notes, File History, Files/Folders, Links, Outline, Plugins, Properties, Publish, Search, Sync, Tags, Tasks, Templates, Themes, Vault, Workspace, Developer - 20+ categories, "100+ commands" per secondary source (dev.to writeup), not independently counted.

Local skill's example command set (obsidian-cli/SKILL.md): `read`, `create`, `append`, `search`, `daily:read`, `daily:append`, `property:set`, `tasks daily todo`, `tags sort=count counts`, `backlinks`, `plugin:reload`, `eval`, `dev:errors`, `dev:screenshot`, `dev:dom`, `dev:css`, `dev:mobile`. All categories these fall under exist in the official list above - no contradictions found, but this is not an exhaustive cross-check since `obsidian help` (the authoritative live list per both the skill and the official page) could not be executed.

Focus/window-stealing assessment (per official page):
| Command family | Steals focus / opens window | Note |
|---|---|---|
| `create`, `open`, `daily`, `random` | Likely yes, unless `silent` flag used | Official: these "open windows"; local skill: `silent` flag "prevent[s] files from opening" |
| `search:open`, `publish:open`, `sync:open`, `history:open`, `web`, `devtools` | Yes | Explicitly named as window-opening in official docs |
| `read`, `append`, `prepend`, `search` (query mode), `property:get/set`, `tasks`, `tags`, `backlinks`, `links`, `eval`, `plugin:list/enable/disable/reload` | Likely no (headless, return text) | Not explicitly confirmed either way by official docs; inferred from command purpose and the `silent`/`format=` flags existing for exactly this use case |
| `dev:screenshot`, `dev:dom`, `dev:css`, `dev:console` | Uncertain | Requires app window to exist to inspect/capture; unclear if it steals OS-level focus from other apps. Not stated explicitly in any source found. |

Output format: official docs describe a `format=` parameter supporting `json`, `tsv`, `csv`, plus `text`/`md`/`yaml`/`paths` depending on command (exact per-command support not enumerated). The local skill does not mention a `format=` flag at all - it only documents `--copy` (clipboard) and `silent`/`total`. **This is a gap in the local skill relative to the official docs.**

Sources: https://obsidian.md/help/cli, accessed 2026-09-24; local skill SKILL.md as above.

---

## 3. Local check: bundle binary help/version output (GUI never opened)

Command run: `"/Applications/Obsidian.app/Contents/MacOS/obsidian-cli" --help` (and separately `help`, `version`, `--version`, `-h`, and no arguments).

**Exact output, identical for every invocation above, exit code 1:**
```
The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.
```

No command list was returned (the app was never launched, per task constraints) and no version string was returned by the CLI itself. The GUI did not open for any of these invocations.

Installed Obsidian version, obtained without opening the GUI, via the bundle's Info.plist:
```
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" /Applications/Obsidian.app/Contents/Info.plist
→ 1.12.7
```
This meets the official CLI's stated minimum (1.12.7+).

Local registration state (also confirms IPC-only design - no standalone mode observed):
```
which obsidian → obsidian not found
/usr/local/bin/obsidian → No such file or directory
~/.local/bin/obsidian → No such file or directory
```

---

## 4. JSON Canvas

**Status: CONFIRMED, local skill matches spec.**

- Spec version: **1.0**, dated 2024-03-11. Source: https://jsoncanvas.org/spec/1.0/, accessed 2026-09-24.
- File extension: **`.canvas`** - explicitly stated on the JSON Canvas homepage: "JSON Canvas files use the `.canvas` extension." Source: https://jsoncanvas.org, accessed 2026-09-24.
- Node types: `text`, `file`, `link`, `group` - matches local skill exactly.
  - All nodes require `id`, `type`, `x`, `y`, `width`, `height`; optional `color`.
  - `text` node requires `text` (Markdown string).
  - `file` node requires `file` (path); optional `subpath` (starts with `#`).
  - `link` node requires `url`.
  - `group` node: optional `label`, `background`, `backgroundStyle` (`cover`/`ratio`/`repeat`).
- Edge fields: required `id`, `fromNode`, `toNode`; optional `fromSide`/`toSide` (`top`/`right`/`bottom`/`left`), `fromEnd`/`toEnd` (`none`/`arrow`, default `fromEnd=none`, `toEnd=arrow`), `color`, `label`.
- Colors (`canvasColor`): presets `"1"`–`"6"` = red/orange/yellow/green/cyan/purple by convention; spec explicitly states preset hex values are "intentionally not defined" so apps can brand them; hex strings (e.g. `"#FF0000"`) also valid.
- Minimal valid example (constructed to match the confirmed spec fields above; not copied verbatim from a page since neither jsoncanvas.org/spec/1.0/ nor the homepage rendered an inline JSON snippet in this session's fetch):
```json
{
  "nodes": [
    {"id": "1a2b3c4d5e6f7890", "type": "text", "x": 0, "y": 0, "width": 250, "height": 100, "text": "Hello Canvas"}
  ],
  "edges": []
}
```

Sources: https://jsoncanvas.org/spec/1.0/, https://jsoncanvas.org, both accessed 2026-09-24; local skill /Users/gzorrilla/Developer/personal/mesa/.claude/skills/json-canvas/SKILL.md (verified field-by-field against the spec, no discrepancies found).

---

## 5. Bases

**Status: CONFIRMED with one discrepancy in the local skill (missing Kanban view type).**

- File format: `.base` files are YAML. Official quote: "Bases must be valid YAML conforming to the schema defined below." Top-level keys confirmed by the official syntax page: `filters`, `formulas`, `properties`, `views` (the `summaries` top-level key for custom named summary formulas is documented by the local skill and by help.obsidian.md/bases/functions but was not present in the specific example block returned by this session's fetch of the syntax page - not a contradiction, just not directly re-confirmed in that one snippet).
- Which version made Bases core: **Obsidian 1.9.0**, released **2025-05-21** (Early Access) - "Introducing Bases, a new core plugin..." (Obsidian's own announcement). It left early-access gating and became available to all users in **Obsidian 1.9.10**, released **2025-08-18** ("Bases was first introduced back in version 1.9.0 in Early Access, but now everyone gets to use it in version 1.9.10 as a public release."). Obsidian 1.10.0 (Early Access) subsequently added a new Bases API, a new Maps plugin, and a new List view.
- View types per the official Bases overview page (obsidian.md/help/bases): **Table, List, Cards, Kanban, Map** (five types). **Discrepancy**: the local skill (/Users/gzorrilla/Developer/personal/mesa/.claude/skills/obsidian-bases/SKILL.md, line 13 and "View Types" section) documents only four - `table`, `cards`, `list`, `map` - and **omits Kanban**. Map view requires the separate Maps community/core plugin plus lat/long properties, matching the local skill's note.
- Minimal example (official, from obsidian.md/help/bases/syntax, trimmed to minimal):
```yaml
views:
  - type: table
    name: "My table"
```

Sources: https://obsidian.md/help/bases, https://obsidian.md/help/bases/syntax, both accessed 2026-09-24; https://obsidian.md/changelog/2025-05-21-desktop-v1.9.0/ and https://obsidian.md/changelog/2025-08-18-desktop-v1.9.10/ (found via web search, titles/dates cross-confirmed, pages not directly fetched in full); local skill SKILL.md as above.

---

## 6. Vault conventions for an agent-written vault

**Status: MOSTLY CONFIRMED; file-watcher and .gitignore items are community convention, not official Obsidian documentation - flagged below.**

- Frontmatter: YAML between `---` delimiters, `key: value` pairs. Six property types: Text, List, Number, Checkbox, Date (`YYYY-MM-DD`), Date & time (e.g. `2020-08-21T10:30:00`). `tags` and `aliases` are both list-type properties (YAML list syntax). Source: https://obsidian.md/help/properties, accessed 2026-09-24. Matches local skill (obsidian-markdown/SKILL.md and references/PROPERTIES.md) exactly.
- Wikilinks: `[[Note]]`, `[[Note|Display]]`, `[[Note#Heading]]`, `[[Note#^block-id]]` - as documented in the local skill, consistent with Obsidian's established link syntax (help.obsidian.md/links; not independently re-fetched this session, but this syntax is long-standing and unchanged in all sources checked).
- Daily notes folder setting: **Daily Notes is a core plugin.** Folder is set via the plugin's **"New file location"** setting; if unset, notes are created at vault root named `YYYY-MM-DD`. Filename date format uses moment.js tokens (official example: `YYYY/MMMM/YYYY-MMM-DD` produces nested folders like `2023/January/2023-Jan-01`). Source: https://obsidian.md/help/plugins/daily-notes, accessed 2026-09-24.
- File watcher / externally written files: **not fully "live."** Obsidian does react to changes on files it already has indexed (a "modified" event triggers a metadata/frontmatter re-parse and reloads any open editor view). However, per multiple community sources, **new files and folders created by an external process (script, AI tool, etc.) do not reliably appear in the file explorer/search/graph until Obsidian is restarted or the vault is manually refreshed** - this is a known limitation, evidenced by the existence of the third-party "Vault File Refresh" plugin built specifically to poll the vault every few seconds to work around it, and by an open Obsidian forum feature request ("Expand the file watcher capability to the whole vault instead of just the root"). **This is not documented on any official obsidian.md/help page found in this session** - treat as a real risk for an agent-written vault, not a confirmed-safe assumption.
- `.obsidian/` folder: contains `app.json`, `appearance.json`, `core-plugins.json`, `community-plugins.json`, `hotkeys.json`, `workspace.json`, `workspace-mobile.json`, plus `plugins/`, `themes/`, `snippets/` directories. **No official Obsidian documentation prescribes gitignore rules for this folder** - the following is community convention only (obsidian-git GitHub discussion #709, Obsidian forum thread "What should I gitignore for my vault's github repository"): gitignore `workspace.json` and `workspace-mobile.json` (personal/device UI state, frequent sync-conflict source), optionally `app.json`; keep `core-plugins.json`, `community-plugins.json`, `snippets/`, `themes/`, and plugin `data.json` files if the team wants shared/reproducible vault configuration, provided none of those files contain secrets/API keys (some community plugins do store tokens in their data.json - worth a manual check before committing).

Sources as inlined above, all accessed 2026-09-24.

---

## 7. kepano/obsidian-skills

**Status: CONFIRMED - official repo, matches local install exactly.**

- Repo: https://github.com/kepano/obsidian-skills, accessed 2026-09-24.
- Owner: **kepano**. License: **MIT**. Description: "Agent skills for Obsidian that teach agents to use Obsidian CLI and open formats including Markdown, Bases, and JSON Canvas."
- Skills included, confirmed: **obsidian-markdown, obsidian-bases, json-canvas, obsidian-cli, defuddle, knap** - exactly the six named in the task.
- Install for Claude Code (from repo README):
  ```
  /plugin marketplace add kepano/obsidian-skills
  /plugin install obsidian@obsidian-skills
  ```
- Install for Codex (from repo README):
  ```
  npx skills add https://github.com/kepano/obsidian-skills
  ```
- Local match: `/Users/gzorrilla/Developer/personal/mesa/.claude/skills/` contains symlinks (into `.agents/skills/`) for all six: `obsidian-cli`, `obsidian-bases`, `json-canvas`, `obsidian-markdown`, `defuddle`, `knap`. **All six are present** - full match on the skill set. Content was cross-checked topically (command lists, YAML schema, node/edge fields) against the official help pages in items 1–5 above with no contradictions found, but no byte-for-byte diff against the upstream repo's SKILL.md files was performed.

Sources: https://github.com/kepano/obsidian-skills, accessed 2026-09-24 (via WebFetch summarization of the README, not a raw byte-for-byte quote); local directory listing of /Users/gzorrilla/Developer/personal/mesa/.claude/skills/.
