# Spike: Xirp parity and Mesa's agent operating environment

Issue: [#168](https://github.com/guillezorrilla/mesa/issues/168). Date: 2026-09-27.

Baseline: installed **Xirp 0.40.1, build 4714f385f, external edition**, bundle `com.spotify.xirp`; Mesa **`ef371bd8a1b0cfe7c886698b2f6edac3f36c77c9`** after P3 #165. The original UI/source inspection used Mesa `40dbb96a3f0548272b73bcc85dde0bd4c07256dc`; the P3 delta was inspected and verified separately below.

Result: Mesa's roadmap covered most feature families, but broad labels hid missing actions. The matrix assigns those details to existing owners. Mesa does not yet have full Xirp parity, guaranteed agent operating instructions, or a complete in-app Vault browser. These remain implementation work.

## Evidence and limits

Read `xirp skill`, its compiled command reference, `xirp features --json`, installed dashboard/daemon source, Mesa core/CLI/app/skills, and the live roadmap. Direct Xirp UI navigation covered project Overview/Quick Session, command palette, every settings category, Git status/graph, Files, skill preview/Edit, Rules, and costs. Controls were observed; saving settings, Git mutations, creating/running/deleting sessions, and paid agent calls were not exercised. The owner's 25 screenshots additionally inform the requested redesign; screenshots alone do not prove behavior.

Labels below: **U** = UI surface observed; **S** = packaged source/CLI evidence only; **C** = conditional or unverified behavior. **Existing** describes Mesa source at the baseline; **partial** requires more implementation; **planned** is roadmap coverage; **added** identifies omissions clarified by this audit; **excluded** is intentional. Only the specific Mesa behavior in the test table below is called **tested**; source presence and a green suite do not prove the rest of a broad row. No row implies end-to-end provider qualification.

No private sessions, account data, vault notes, credentials, screenshots of private work, or copied third-party implementation are included. ADR-0005 keeps Mesa's own implementation; ADR-0006/0008 retain file-based vault ownership and injected dependencies.

## All 26 registered modules

`xirp features --json` reported these exact IDs again on 2026-09-27. Registration does not prove configuration or successful execution. The owner column names the existing feature issue that must demonstrate behavior before [#156](https://github.com/guillezorrilla/mesa/issues/156) closes; release means [#41](https://github.com/guillezorrilla/mesa/issues/41).

| Xirp module | Evidence / retained behavior | Mesa status and owner |
| --- | --- | --- |
| `auth0` | S: application sign-in | Excluded, P4 |
| `catalog-link` | S: local repository URL/reference checkout; Portal catalog separate | Added local route, #268; Portal excluded |
| `claude-bootstrap` | S: first-run projects/session discovery | Planned, #265 |
| `cost` | U: session/aggregate tokens, estimates, charts, informational alerts | Partial run usage in receipts; full view planned, #266 |
| `doctor` | U: setup health/fixes | Existing Doctor; integrated fixes planned, #266 |
| `files` | U/S: tree/editor; safe saves and file management | Planned, detailed actions added, #270 |
| `licenses` | U: attribution settings | Added, release |
| `log-viewer` | U: live application logs | Partial session output logs; app diagnostics added, #266 |
| `message-actions` | U settings/S delivery: copy and passage review feedback | Planned; comments/retry added, #271 |
| `native-browser-panel` | U settings/S behavior: browser and element annotations | Planned; agent feedback loop added, #271 |
| `notification-preferences` | U: kind toggles, quiet/digest | Planned; subagent attention added, #266 |
| `portal` | U: instance connection/upload | Excluded, P4 |
| `pr-outcomes` | S: session-to-PR outcome attribution | Planned, #265 |
| `repo-insight` | S: local identity, health, growth | Planned, #265 |
| `rules` | U: native global/project rules/settings files | Planned, #253; preserve AGENTS.md policy |
| `saved-prompts` | U: named prompt management/insertion | Planned, #173 |
| `screenshot-upload` | U settings/S delivery: attach screenshot | Planned, #271 |
| `session-search` | U/C: experimental flag observed off | Planned in Mesa, #265; not Xirp default behavior |
| `skills` | U: scope, preview, support files, Edit | Partial Mesa list/sync/run, plus project-brief landing; native inventory/edit added, #253 |
| `usage-telemetry` | S: Portal telemetry proxy | Excluded, P4 |
| `weekly-rewind` | U settings/S summary: activity retrospective | Planned, #266 |
| `whats-new` | U: release-notification surface | Excluded, P4; ordinary updates belong to release |
| `workflow-status` | U: workflow labels/layout separate from agent state | Planned, #268; Faro process state already exists |
| `worktree-cleanup` | U settings/S execution: rechecked stale removal | Partial explicit removal; cleanup planned, #270 |
| `worktree-filter` | S: folder/branch/session filters | Added, #270 |
| `xirp-support` | U: docs/feedback links | Mesa equivalents added, release |

## Core workspace coverage outside the module count

The daemon's core handlers own these capabilities; counting modules alone would miss them. The owner approved eight feature-sized P4 issues rather than per-operation tickets. Each retained row needs demonstrated app/CLI behavior before #156 closes.

| Capability | Xirp evidence | Mesa baseline / remaining P4 scope |
| --- | --- | --- |
| Projects | U/S: registration, pins, visibility, ordering, directory scan/import | Registration exists; rename/pins/hiding/bulk discovery added, #268 |
| Start work | U: goal, agent, plan/background, setup, main/worktree/terminal, Quick Session; S: General Session in home directory | Goal/agent/worktree exist; Overview and modes #268, project-less General session #265 |
| Lifecycle | S: native fork, archive, restart restore/dismiss, lineage/dependency edits, force-start and child cascades | Stop/resume/rename/remove/adopt/handoff/queue exist; missing operations #265 |
| Sidebar/overview | U: compact project/session navigation, grouping, sorting, density, layouts | Current table Board; sidebar/workflow/grouped views #268 |
| Terminal grid | U controls/S session execution: project tabs, live tiles, groups, zoom | Embedded terminal and terminal-app `mesa view` exist; full grid #268 |
| Palette/shortcuts | U: searchable navigation/actions/settings and shortcut editor | Navigation/palette #268; shortcut preferences #173 |
| Session view | U controls/S delivery: model/effort/context, terminal child, prompts, screenshot, review, browser feedback | Terminal/context and basic actions exist; session detail #265, prompts #173, feedback #271 |
| History/search | U settings/S retrieval: native history/import, content search | Claude adoption exists; provider import/history and full transcript search #265 |
| Git | U status/graph; S mutations: stage/unstage, commit, push/pull, stash/pop, branches, commit/branch comparisons | Git tab and concrete actions #270 |
| Files/editor | U tree/editor; S writes: create/rename/delete, dirty-close guard, external-change conflict, Markdown preview | Safe editor and file actions #270 |
| Worktrees | U settings/S operations: location/base/fetch, ignored-folder carryover, sparse checkout, setup/delete scripts, rerun/recycle | Create/remove tied to sessions exists; manager and safety #270 |
| Agents | U native defaults/config and install state; S lifecycle actions | Claude/Codex interactive, hooks, and headless exist; Antigravity spike and settings #265 |
| Settings/attention | U: notifications, layouts, accessibility, terminal/editor, native permissions, local diagnostics | Doctor/config primitives exist; settings #173, notification/diagnostic views #266, native agent settings #265 |
| Distribution | U: version/update/license/help surfaces | About/update controls/attributions added to #41 |
| Meaningful Mesa history | Mesa-specific requirement: decisions and substantive vault changes in context, historical receipts still accessible | Current recorder writes routine action receipts; selective recording and contextual history #274, primary Receipts destination removed by #268 |

These are observable behaviors, not a requirement to copy Xirp's framework, database, branding, hidden internals, or exact settings wording.

## Mesa behavior tested at the refreshed baseline

The existing behavior below is exercised through controlled core, CLI, or app tests. These tests do not prove native/provider behavior or the remaining actions in a parity row.

| Behavior | Test evidence |
| --- | --- |
| Project registration and listing | `packages/core/src/projects/projects.test.ts`, `packages/cli/src/commands/projects.test.ts`, `apps/desktop/src/screens/ProjectsScreen.test.tsx` |
| Open, resume, queue, handoff, adopt, stop and remove sessions | `packages/core/src/sessions/{open,resume,queue,handoff,adopt,stop,remove}.test.ts` |
| Skill inventory/sync and project-brief landing | `packages/core/src/skills/{skills,landing}.test.ts`, `packages/cli/src/commands/skills.test.ts` |
| Doctor checks and app health display | `packages/core/src/doctor.test.ts`, `packages/cli/src/commands/doctor.test.ts`, `apps/desktop/src/screens/DoctorScreen.test.tsx` |
| Session and decision receipts, plus historical app reading | `packages/core/src/receipts/receipts.test.ts`, `apps/desktop/src/screens/ReceiptsScreen.test.tsx` |
| Vault init/status/open and controlled note writes | `packages/core/src/vault/{vault,notes}.test.ts`, `packages/cli/src/commands/vault.test.ts` |
| Board rendering and terminal-app view command | `apps/desktop/src/screens/board/BoardScreen.test.tsx`, `packages/cli/src/commands/view.test.ts` |

## Durable installed-source anchors

Paths below are relative to `/Applications/Xirp.app/Contents/Resources/`. Search the named symbols/labels in the original installed artifacts. Temporary formatted copies and their line numbers are not durable citations; extracted implementation stays outside the repository.

| Artifact | Search anchors |
| --- | --- |
| `app.asar` member `node_modules/@chirp/daemon/dist-external/chunks/index-Dg50Bur2.js` | `coreApiCatalog`, `registerModule`; `workspace:scan`, `workspace:import`; `session:fork`, `sessions:restore-bulk`; `worktree:recycle`, `worktree:deleteConflicts`; `files:write`, `expectedMtime`; `SKILL_HARNESS_DIRS`, `skills:save`; `buildChirpLaunchPrompt` |
| `dashboard/assets/index-dcv9aZdu.js` | `General Session`, `Restore Previous Sessions`, `Minimap options`, `editor.vim_mode`, `browser-annotation-send`, `notifications.kind_subagent_input`, `feature-flags.session_search` |
| `dashboard/assets/GitTab-WIZAICyH.js` | `git:unstage`, `git:stashPop`, `git:checkout`, `git:createBranch`, `git:deleteBranch` |
| `dashboard/assets/FilesWorkspace-D2ClM498.js` | `New file`, `New folder`, `This file changed on disk.`, `Overwrite` |
| `dashboard/assets/ResponseReviewPanel-DH7J1Xs0.js` | `Response snapshot`, `Saved comments`, `Send review`, `Retry` |

SHA-256 fingerprints pin the inspected artifacts, rather than whatever a future installation supplies:

```text
app.asar: f6b912304983218e8694d48831fa129cf00cf523429e006d9dca7a25508e9a56
chirp-cli/xirp: 5cd2a49c031291c101eca21396d5ca2d877ea3165d80f557bf9bbec28f3758ae
dashboard/assets/index-dcv9aZdu.js: 5c120557d338ba5cee171225af1ae7b4eb610862e9600b5964126e3f195bbf3c
extracted index-Dg50Bur2.js: ffaad668db2f44f50375bcf1f71b6b0d0469fd61ad2474e127a1e8914d92bc45
```

Conditional findings: full PR/CI/review injection requires an unavailable integration provider; remote/Honk sessions and remote skills require `honk:enabled`; bundled task/feed/ACP code is not an active external module. Voice requires browser SpeechRecognition and was not tested. Status timelines are internal-edition-only. Bundled Squab install/share/move commands do not establish exposed Xirp marketplace features. Gemini/Cursor/pi/Snipe are outside the agreed agent set. Keep these outside mandatory parity unless independently qualified and explicitly selected.

## Mesa's additional operating contract

Existing [launch preparation](../../packages/core/src/sessions/launch.ts), [skills](../../packages/core/src/skills/service.ts), [caller identity](../../packages/core/src/sessions/caller.ts), [generated help](../../packages/cli/src/help/reference.ts), and [Mesa skill](../../skills/mesa/SKILL.md) already supply useful foundations. `mesa` and `mesa-handoff` default enabled; `session-summary` and `project-brief` also ship. Skills link before open/resume/adopt/handoff/queue/run into the actual checkout. Sync can warn and continue; a disabled/conflicting skill can prevent discovery. Both Claude and Codex hooks discard stdout and inject no bootstrap. #253 owns the operating pointer and delivery status.

Xirp's external build also omits its app-CLI helper prompt in `buildChirpLaunchPrompt`. Mesa's universal instruction guarantee is additional product behavior, not assumed parity.

**#156 acceptance:** deliver a short pointer, preserving user goal/repository instructions, that lets each supported agent resolve profile/session/project/worktree/goal; discover generated help and effective skills; start/queue/message/handoff; find meaningful decisions and vault changes under #274, with historical receipts available explicitly; and respect human waits, native permissions and guardrails. Routine lifecycle/output is local operational state, not knowledge to save. Surface missing/conflicting/unsupported delivery. Reuse existing owners, not a parallel command catalog.

Prove the P4 pointer across fresh/worktree/resume/resumed-adoption/handoff/queue/headless and supported clear/compact paths; #157 later proves the same matrix with full vault retrieval. Record provider/version, actual identity/skill/coordination output and context cost. Record-only adoption does not retrofit the outside process. At the refreshed baseline, Claude and Codex support headless skills; Claude alone supports adoption, Codex lacks context readings, and Antigravity is absent. File presence and scripted processes are not provider proof.

## Complete local knowledge visibility

[Current vault service](../../packages/core/src/vault/service.ts) exposes init/status/open. [App](../../apps/desktop/src/App.tsx) has Board, Projects, Receipts, Doctor and Help. The header's Open in Obsidian and newest-50 receipts reader do not make a Vault browser.

**#157 acceptance:** inventory all active-profile user content, including nested/unindexed/non-project notes, raw/wiki/projects/receipts/daily, index/log, attachments, Canvas and Bases. Supply tree/inventory, text search/project filters, Markdown/properties, local links/backlinks, exact-file Obsidian opening and explicit unsupported-format fallbacks. Keep application internals excluded; show external edits, broken/ambiguous links and missing files; clear stale content on profile switches. Test more than 50 receipts and every listed content category.

Agent overview/search/read and structured decision/summary/note writes share that vault owner; bind profile/project scope, reject canonical-path/symlink escapes and preserve locked/user material. Successful substantive writes create one linked meaningful history entry under #274; no-ops, retries and bookkeeping create none. Demonstrate later-session retrieval. Obsidian skills are planned library additions, not shipped merely because development skills exist in this repository.

[#38](https://github.com/guillezorrilla/mesa/issues/38) adds linked Canvas/Map, Bases and Daily views; it complements the browser. #41's first-release smoke covers the workspace, operating instructions and local vault. [#166](https://github.com/guillezorrilla/mesa/issues/166) connections, [#39](https://github.com/guillezorrilla/mesa/issues/39) automations and [#40](https://github.com/guillezorrilla/mesa/issues/40) automatic free-text routing remain post-MVP.

## UI design follow-through

Mesa's current wide table, crowded header and disconnected screens differ from Xirp's compact project/session navigation and contextual workspace. The owner explicitly requests a redesign, including a visible search entry and command palette, using the 25 supplied screenshots. This audit does not implement that redesign. P3 #165 closed by merged PR #276; the refreshed baseline and P4 ownership above release #268 to start. #268 covers the shell/navigation, session workspace and visual review against those references while retaining Mesa's profile, Faro and Vault access. Ordinary command search/palette is MVP; automatic routing remains #40.

## Verification

Focused existing checks at the original Mesa commit: **15 files, 95 tests passed**, exit 0, 7.37 s. Exact command:

```sh
pnpm exec vitest run packages/core/src/skills/skills.test.ts packages/core/src/sessions/open.test.ts packages/core/src/sessions/resume.test.ts packages/core/src/sessions/adopt.test.ts packages/core/src/sessions/queue.test.ts packages/core/src/sessions/handoff.test.ts packages/core/src/sessions/run.test.ts packages/cli/src/commands/skills.test.ts packages/cli/src/commands/index.test.ts packages/core/src/vault/notes.test.ts packages/core/src/vault/vault.test.ts apps/desktop/src/screens/ProjectsScreen.test.tsx apps/desktop/src/screens/HelpScreen.test.tsx apps/desktop/src/screens/board/RunSkillDialog.test.tsx apps/desktop/src/screens/ReceiptsScreen.test.tsx
```

These prove temp-home file behavior and controlled core/CLI/UI wiring. They do not qualify actual provider authentication, skills, MCP, lifecycle behavior, or end-to-end Xirp parity.

On merged P3 `ef371bd`, `pnpm verify` passed: Biome and ASCII punctuation, TypeScript, 79 Vitest files/514 tests, six Rust tests, and core/CLI/desktop builds. The P3 delta (`git diff 40dbb96..ef371bd`) adds Codex hooks/headless runs, project-brief landing, and fuller skill/session/decision receipts; it does not add the P4 workspace, selective history, full Vault browser, or an agent startup pointer. The installed Xirp CLI remains `0.40.1+app.4714f385f`, with the same 26 module IDs and matching pinned artifact hashes. All eight P4 feature issues remain open, with owners shown above; #157 still owns full Vault/MCP proof.
