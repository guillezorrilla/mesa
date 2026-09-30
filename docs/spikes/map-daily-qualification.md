# Map, Bases and Daily qualification (#327, #38)

Status: qualification complete, recorded on 2026-09-30. Final merged-main package and CLI at `f0c5257` pass Daily, Vault CRLF, Bases and Map/native Obsidian rechecks. Owned test artifacts are removed after archiving.

## Scope and builds

`$Q` is the disposable qualification root outside the repository. `$ARCHIVE` is its retained private, sanitized evidence archive; after cleanup, `$Q/evidence/<path>` references resolve as `$ARCHIVE/<path>`. Profiles are `p6q` and `p6q-other`; the invented Obsidian vault is `Mesa-P6-Quay`, project `quay-lantern`, and dedicated tmux socket `mesa-p6q`. No connected source was configured. Nothing from a normal vault or profile was used as test content.

| Environment | Actual version/build | Evidence |
| --- | --- | --- |
| Initial merged P6 CLI/package | `cc85531`, Node 24.16.0, Mesa 0.1.0 | build/verify/package logs; raw CLI JSON |
| Claude Code | 2.1.285, Opus 5.5, xhigh | selected native transcript/tool results |
| Codex | 0.159.2 | selected native rollout tool calls; model observation was not retained |
| Antigravity | 1.2.14, Gemini 3.8 Flash High | selected native SQLite tool records |
| Obsidian | 1.13.7, installer 1.12.7 | native Canvas and Bases screenshots/queries |
| tmux | 3.7c | dedicated qualification socket |
| CRLF fix package and CLI | `5a5aa1a`, merged as `5f1eee0` with identical tree | `raw/app-runtime-exact333.json`, `raw/native333-acceptance.json` |
| Base reader fix package and CLI | `40c19ba`, merged as `f0c5257` with identical tree | `raw/app-runtime-exact334.json`, `raw/native334-acceptance.json` |
| Final merged-main package and CLI | `f0c5257` | `raw/app-runtime-final.json`, `raw/final-main-acceptance.json`, `builds/p6-final-main-*.log` |

All CLI commands used Node 24.16.0 and `TZ=America/Vancouver`. The command alias was:

```sh
m() { node "$MESA_WORKTREE/packages/cli/dist/mesa.js" --profile p6q "$@"; }
```

Codex used a disposable `CODEX_HOME`; Claude used its signed-in native home with temporary Mesa hooks; Antigravity used temporary Mesa hook/MCP entries. Native folder trust and Mesa hook review were accepted only for the invented project. No new API key, broader provider permissions, quota bypass, or external-source connector was used. Debug packages were copied to uniquely named disposable apps and launched with the explicit qualification profile and CLI. Screenshots capture only the owned Mesa or invented-vault Obsidian window.

## Real provider saves

Actual provider records contain **14 completed Mesa tool calls**: five `project_context` results and nine changed saves. Each context result contains the invented `# Quay lantern` heading and `quaycobaltseal` marker. Each successful save produced a unique receipt with the expected profile, project, actor/session/agent, status, and exact output target; its target note exists and its receipt link occurs once in `log.md`. Decision probabilities and confidence remain in the receipts.

| Provider | Actual Mesa/native sessions | Successful saves |
| --- | --- | --- |
| Claude | `yjvqdwrz`, resumed as `vzpas298`, then `xfp4x9g2`; one native conversation | decision `claude-quay-lens`, summary `yjvqdwrz`, note `claude-quay-note` |
| Codex | trusted `7ykez2eg`, native `01a0f399-2ebd-70d2-9265-955524da37c9` | decision `codex-quay-panel`, summary `7ykez2eg`, note `codex-quay-note` |
| Antigravity | `883kt0rv`, native `2fd0f0b1-ca37-4abf-9410-6ac881be1078` | decision `agy-quay-buoy`, summary `883kt0rv`, note `agy-quay-note` |

Claude's three actual context calls establish startup and both resumed conversations; Map uses the transitive A-to-B-to-C record edges. The earlier Codex `1bq29hec` record has no response-item records and is not model/tool-work evidence. Antigravity's first decision call failed on an extra `project` argument; the successful retry is counted once. Codex displayed a low-weekly-quota warning, but the actual required calls completed before the session was stopped. All six owned session records were ended before removing temporary provider settings.

Evidence: `native-selected-evidence.md`; `raw/native-{claude,codex,antigravity}-selected.json`; `raw/native-save-results.json`; `raw/native-receipt-validation.json`; scoped source fingerprints in `raw/native-extraction-ownership.json`. Selected Mesa calls/results, pointers and answers were extracted, not whole provider contexts, global settings, login copies, or encrypted database contents.

## Meaningful views and native Obsidian

Three separately labelled synthetic controls supplement the nine real-provider receipts: a targetless meaningful guardrail, an old routine receipt without `kind`, and a Daily-target bookkeeping receipt. They test policy/fallback, not provider behavior.

| Native view | Actual rows | Observed behavior |
| --- | --- | --- |
| `receipts.base`, first/default Meaningful table | 10 | nine real saves plus targetless guardrail; routine and Daily bookkeeping excluded; typed `started` descending |
| Receipts By kind grouped cards | 10 | same row set, grouped decision/guardrail/vault-change |
| Receipts explicit Legacy | 12 | both excluded controls remain discoverable |
| `sessions.base`, first/default Sessions and decisions | 6 | three summaries and three decisions, outside receipts, no duplicate receipt rows; typed `updated` descending |
| Sessions By project grouped cards | 6 | same six notes, grouped under quay-lantern |

The native formula links point to all nine exact existing note targets and, for the targetless guardrail, its exact receipt file. Actual clicks opened the Codex decision body/probabilities and the guardrail receipt. `obsidian vault=Mesa-P6-Quay open path=<base>` selected the owned file before `base:views`/`base:query`; actual queries and visible native rendering agree. Obsidian 1.13.7 uses the owner's table/grouped-cards compatibility path. Native Kanban was not generated or qualified; it requires 1.14.

Evidence: `raw/obsidian-assertions.json`, `raw/obsidian-receipts-{meaningful,cards,legacy}.json`, `raw/obsidian-sessions-{default,cards}.json`; `shots/obsidian-receipts-{default,cards,legacy}.png`, `shots/obsidian-sessions-{default,cards}.png`, `shots/obsidian-codex-target.png`, `shots/obsidian-receipt-fallback.png`.

Native Obsidian eventually rewrote both generated Bases without their leading ownership comment. Their valid view definitions remained. Mesa's writer correctly kept these now-unmarked files. Qualification exposed #334: the reader incorrectly tied metadata display to writer ownership. The fix reads valid names from any Base without adopting it, changing the exact leading-comment write guard, or adding persistent ownership metadata. An invented unknown-YAML-key experiment was removed; it does not establish durable ownership across Obsidian save paths.

## Daily and public CLI controls

`m log "Invented quay inspection completed." --json` appended one explicit log and rebuilt today's Daily note. `m daily --date 2026-09-30 --json` agrees with the saved note: **four decisions, six vault changes, one explicit log**. The same ten meaningful receipt/target links appear in native Daily, with all nine note targets and a receipt fallback. Routine events, raw terminal tails, and the Daily bookkeeping receipt are absent.

The note begins with invented raw CRLF properties and authored body. Shared parsing bug #333 initially displayed the property block as body; its minimal shared-parser fix preserves original body slicing and also honors CRLF locks. Actual package and CLI at `5a5aa1a` show properties separately from the authored heading/text in both Daily and Vault. Two actual native Rebuild clicks preserve exact Daily/log/index bytes and mtimes, the entire authored CRLF prefix, and 12 recursive receipt files.

Repeated public CLI Daily, Map and Bases commands also preserve bytes and mtimes of all five tracked files without log/index/receipt growth. A separately controlled public-interface probe verifies 31 unique IDs over 32 receipt files, more than the default receipt-list cap, duplicate-ID suppression, local/UTC month-boundary selection, and legacy UTC timestamps. September 30 contains 27 meaningful entries and one explicit log; October 1 contains two and no log. Exact automatic/init lines are excluded while an ordinary user wikilink remains. Partial markers refuse both build and log without changing either buffer. The controlled fixture was removed. These are synthetic correctness checks, not real-provider/native evidence.

Actual CLI locked-note and outside-symlink controls refuse Daily rebuild and explicit logging without changing Daily/log or the outside target; originals were restored. Public regression tests cover duplicate/reversed markers and CRLF saved-note lock refusals. Temporary refusal-fixture edits are separate from the no-op mtime comparison.

Evidence: `raw/derived-noop.json`, `raw/daily-refusals.json`, `raw/daily-exactpackage-{before,after}333.json`, `raw/native333-acceptance.json`, `raw/daily-user-prefix.bin`; `shots/mesa-daily-exactpackage333.png`, `shots/mesa-vault-exactpackage333.png`; retained `p6-daily-controls.mjs` and result JSON.

## Map and profile-safe navigation

`m map --json` produces one project group, six saved session records, a warning text node, and two resumed edges. The structured reader reports eight total nodes including the group and warning, and two edges. Packaged Mesa and native Obsidian draw the actual saved Canvas with this geometry; JSON parsing alone is not counted as rendering. The pre-trust Codex record remains a valid saved record, without being counted as provider-work evidence. Update explicitly warns it replaces personal Canvas edits.

Native Daily target and fallback clicks open the exact Codex decision and synthetic guardrail receipt in Vault (`raw/daily-native-links334.json`, `shots/mesa-daily-exact-target334.png`, `shots/mesa-daily-receipt-fallback334.png`). The receipt reader can show its raw details after deliberate opening; Daily itself excludes those details.

Native Mesa file-node activation opens the exact `wiki/sessions/yjvqdwrz.md` summary. Physical Tab/Return activates both the file target and its distinct exact-session action. A text session's profile-qualified URI selects its exact session. Native Obsidian shows the saved group, records and both ancestor arrows.

| Owned-app URL delivery | Actual result |
| --- | --- |
| `mesa://session/7ykez2eg?profile=p6q` | selected exact Codex record |
| `mesa://session/vzpas298?profile=p6q-other` | quiet mismatch guidance; no profile switch, clone, or session lookup; prior selection retained |
| Bare `mesa://session/vzpas298` | active-profile lookup and exact selection |
| Unknown `zzzzzzzz` | quiet unavailable guidance after active-profile lookup |
| Empty profile query | invalid-link guidance; no lookup or clone |

Delivery used `open -a <owned-app> <url>`, with a scoped wrapper recording only `show` lookups and a positive control. It does not qualify changing the system's default URI handler or native cold-start delivery; startup ordering is covered by focused app tests. Native missing/empty Map displays No map yet and Update; malformed JSON displays an explicit unavailable reason. Held originals were restored byte-for-byte with original mtime.

Evidence: `raw/native-uri-cases.json`, `raw/native-mismatch-no-lookup.json`, `raw/app-show-lookups.txt`, `raw/map-negative-controls.json`; `shots/mesa-map.png`, `shots/mesa-map-exact-summary.png`, `shots/mesa-qualified-link-{match,mismatch}.png`, `shots/mesa-map-{missing,empty,malformed}.png`, `shots/obsidian-canvas.png`.

## Fixes, final gate and cleanup

#333 merged in PR #335 with independent Standards and Spec zero-findings reviews. Root `pnpm verify` and mandatory pre-push pass: 157 test files, 1,004 JavaScript and seven Rust tests, plus lint/typecheck/build. The reviewed/native head and squash-merge tree are identical. #334 merged in PR #336, also with independent Standards and Spec zero-findings reviews. Its full gate/pre-push pass 157 files, 1,017 JavaScript and seven Rust tests. Actual native Vault names/YAML and Open in Obsidian pass for both comment-free Bases; native Write Bases views keeps both files and history unchanged (`raw/native334-acceptance.json`).

Final `pnpm build`, `pnpm verify` and native package build pass on merged main `f0c5257`. The rebuilt package and CLI agree on Daily 4/6/1, both Base name lists/raw YAML, and Map one group/eight total nodes/two edges. Two native Daily rebuilds retain all six tracked files and mtimes, the authored CRLF prefix and 12 receipts. Final Map explicitly refreshes ended session state once; its repeat is a no-op. Final Mesa Open in Obsidian opens the actual Canvas, visibly rendered in the invented native vault. Evidence: `raw/final-main-{before,refreshed-before,after,acceptance}.json`, `raw/final-{daily,map,map-repeat,bases,read-*}.json`, `shots/mesa-final-*.png`, `shots/obsidian-final-canvas.png`.

Temporary provider hooks/MCP entries were uninstalled after all owned provider runs ended. Claude settings, Antigravity hooks absence, MCP config and CLI settings match their exact pre-test backup bytes. The disposable trust key/workspace value were removed by exact path, preserving other trust entries. Global Codex config was read-only and currently matches its qualification baseline. Claude's runtime `.claude.json` has unrelated structural changes; only this run's project entry was removed, without blanket restoration or attribution. Evidence: `raw/provider-settings-cleanup.json`, `raw/hooks-after-uninstall.json`, `raw/all-ended-before-settings-cleanup.json`.

The private sanitized archive contains **216 artifacts and SHA256SUMS.txt**, with 216 verified entries, zero checksum failures and zero credential-pattern hits. Text qualification/home/worktree/email values were replaced; screenshots contain only owned Mesa or invented-vault Obsidian windows. Source fingerprints describe original sources; the manifest describes sanitized artifacts.

After archiving, root rechecked 19 file fingerprints and exact inventories before removing 11 owned native artifact roots: the exact Claude disposable-project transcript folder and UUID context/session-env, two Codex rollouts inside its disposable home, and the Antigravity UUID database/WAL/SHM, annotation, presence and brain tree. The owned Obsidian vault window was closed and its registration removed through native UI; other vault registrations/windows were preserved. Profiles p6q/p6q-other, the dedicated tmux server, qualification folders, disposable app copies, login home and private backups are removed. The final owned app was stopped by verified executable path. Evidence: `raw/p6-native-cleanup-result.json`, `raw/p6-final-cleanup-result.json`.

Shared Claude/Antigravity histories and summary/index/cache files remain untouched. They can retain UUID references (observed Claude history six, Antigravity history one, shared summary database five and summary protobuf two literal occurrences); this is a scoped cleanup exception, not a claim of complete native metadata absence. Global Codex artifacts and unrelated settings/runtime changes were preserved. Final hook/MCP comparisons retain exact equality except Claude runtime config, whose unrelated drift remains. Private backups/auth copies are excluded from the archive. The repository contains only this portable report and domain documentation, not vault data, credentials, transcripts, screenshots or personal absolute paths.
