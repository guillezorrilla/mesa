# P6 deep review (#328, #38)

Reviewed on 2026-09-30. P5 #157 is closed. P6 implementation and qualification are merged; this report maps closure to exact evidence and records the deep review's confirmed fix.

## Frozen range and independent axes

The initial whole-phase review compared `30a94ddc17ae62554c2a3a9166ed7725b4800e8d...df6d490ef57e574a8b5fe27d341896a753289561`: 59 changed files, 3,825 insertions and 129 deletions. The base is P5 closure, the head is P6 qualification PR #337. Independent Standards and Spec reviewers did not author P6 implementation. They read the complete changed code and caller flows, used the documented design/simplification/quality skills, and checked actual native evidence boundaries. The final integration head is `938db47b6e592096c21c63a54499d5fa96793cdc` (PR #339, tree-identical to reviewed `ef80d0f`).

### Standards

Initial verdict: one blocking documented-behavior violation, zero other design violations and zero judgment smells. A successful explicit log after an unterminated prior-day log line disappeared from today's Daily. The shared append owner glued the timestamps together; the new Daily reader filtered the resulting line by its old timestamp. This violated explicit-event provenance in CONTEXT.md. Fifteen focused files and 188 tests passed; the separate public-interface reproduction established the defect.

PR #339 fixes #338 at the shared appendLog owner, preserving all old bytes and adding one separator only when needed. Independent Standards review at `ef80d0f59e2af2c347456ae4562354439d881a96` reports zero violations and zero smells. Four focused files/54 tests and a public unchanged-save receipt-repair probe pass: one repaired line, no new receipt, another retry leaves bytes unchanged.

### Spec

Initial verdict: one confirmed P1 finding, the same independently reproduced explicit-event loss. It violated #325's explicit-user-events criterion and #38's exactly-once view criterion. All other Map/Bases/Daily, scope/ownership, navigation and native-evidence requirements passed; sixteen focused files/198 tests passed. No scope creep or additional evidence gap was found.

Independent Spec review of #338 at `ef80d0f` finds zero implementation defects. Four files/57 tests and three existing retry checks pass. Actual CLI/package acceptance and full gates complete the remaining execution evidence. Final whole-phase integration verdicts are recorded in this report's PR.

## Confirmed findings and fixes

| Finding | Merged fix | Verification |
| --- | --- | --- |
| CRLF properties rendered as body and lock parsing differed | #333, PR #335 | Shared frontmatter reader preserves original body slicing; nine red regressions become green. Exact-fix package/CLI show separate properties and preserve the authored CRLF prefix on two native rebuilds. |
| Obsidian saves remove the leading Base ownership comment; reader then hid valid view names | #334, PR #336 | Read metadata from valid marked or unmarked Base YAML; writer ownership remains strict. Exact-fix native Base names/raw YAML/open buttons agree; explicit writer keeps both unmarked files. |
| Unterminated log joins new events to an old timestamp | #338, PR #339 | Four red failures/33 controls, then 57 focused passes. Public core/CLI and receipt repair use the shared fix; empty/LF/CRLF/lone-CR/invalid-byte prefixes covered. Actual native Daily renders the fresh event once and Rebuild preserves log/Daily/index bytes and mtimes. |

No confirmed in-scope finding is deferred. No speculative abstraction or unrelated cleanup was added.

## Every #38 checklist item

| Exact item | Merged implementation | Acceptance evidence |
| --- | --- | --- |
| map command and canvas golden test | #323, PR #330 | Core golden/public CLI tests; [native Map](map-daily-qualification.md#map-and-profile-safe-navigation) draws one project group, six saved records and two resumed edges in Mesa and Obsidian. |
| Bases files with table and grouped-card views (Obsidian 1.13 compatibility) | #324, PR #329; reader PR #336 | [Native Bases](map-daily-qualification.md#meaningful-views-and-native-obsidian): Meaningful/By kind 10 rows, Legacy 12; Sessions/By project 6, exact target/fallback clicks. The owner's recorded grouped-cards compatibility decision applies; native Kanban requires 1.14 and was not qualified. |
| daily builder | #325, PR #331; shared fixes PR #335/#339 | [Daily](map-daily-qualification.md#daily-and-public-cli-controls): four decisions, six changes, one log; local-date/dedup/refusal controls and raw-byte preservation. Unterminated-log recheck below. |
| Map screen | #326, PR #332 | [Native Map/navigation](map-daily-qualification.md#map-and-profile-safe-navigation): saved geometry, warning/no-map states, physical keyboard file/session targets, matching/mismatched/unknown profile-safe links. |
| Daily screen | #325, PR #331; CRLF PR #335 | [Daily and final package](map-daily-qualification.md#daily-and-public-cli-controls): same ten receipt links and nine targets/fallback; separate CRLF properties, authored text and two actual Rebuild actions. |
| docs | PR #329/#330/#331/#332/#337 and this report | CONTEXT.md, ADR-0006 amendment, qualification report and this exact acceptance mapping. |

## Every #38 acceptance item

| Exact criterion | Verified evidence |
| --- | --- |
| A disposable invented vault containing meaningful decisions, note changes, explicit log entries and legacy routine-action receipts produces a Daily/Bases view containing the meaningful items exactly once, with exact target links; routine events and raw terminal tails are absent from defaults. Legacy files remain discoverable in #157. | [Real provider saves](map-daily-qualification.md#real-provider-saves): 14 completed Mesa calls, five context results and nine changed saves across Claude Code, Codex and Antigravity. [Native Bases](map-daily-qualification.md#meaningful-views-and-native-obsidian) and [Daily](map-daily-qualification.md#daily-and-public-cli-controls) agree; three synthetic controls are labelled separately. [P5 full Vault acceptance](p5-review.md#all-seven-157-acceptance-criteria) qualifies full legacy discovery. |
| Rebuild the same daily note twice and verify stable generated content, no recursive history and preserved user-authored content. | [Two actual native rebuilds](map-daily-qualification.md#daily-and-public-cli-controls) preserve CRLF authored prefix, log/index/Daily bytes and mtimes, and 12 recursive receipts. Separately labelled public controls cover more-than-default-cap and duplicate-ID/month-boundary cases. #338 native recheck below preserves its three tracked files. |
| Verify CLI --json and app views agree; run pnpm verify and /code-review on each implementation PR, with exact focused test commands attached to its task. | PR #329/#330/#331/#332/#335/#336/#339 contain issue-linked independent Standards/Spec reviews, focused checks, full verification and mandatory pre-push evidence. [Exact-build qualification](map-daily-qualification.md#scope-and-builds) separates earlier renderer/URI proof from final merged package/CLI rechecks. Final gate at #338 passes 157 files/1,024 JavaScript tests and seven Rust tests plus lint/typecheck/build. This report's final gate/review is in its PR. |

## Fresh #338 CLI/package recheck

A new invented vault/profile outside the repository starts with yesterday's log line and no LF. Actual built CLI at `ef80d0f` appends today's event, preserving every prior byte plus one separator. Daily JSON reports one event; repeat returns changed:false. The exact-head debug package renders that event once. A physical Rebuild click invokes the real CLI with the selected date; tracked log/Daily/index hashes and mtimes remain identical. This recheck makes no fresh provider or Obsidian claim: the change is the shared append owner, and earlier provider/native view evidence remains pinned above.

The private `p6-review` archive contains 14 checksummed artifacts: red/green/full/pre-push/package logs, runtime/CLI/native results, the actual command trace, invented log/Daily bytes, owned-window screenshot and cleanup record. The disposable app was stopped after exact process-path verification; its profile and root were removed. No provider settings/hooks, Obsidian registration or normal vault/profile content was changed by this recheck.

## Evidence boundaries and cleanup

The primary private P6 archive has 216 checksum-verified artifacts; independent deep Standards checked all entries and sampled native/provider records/screenshots. [Qualification cleanup](map-daily-qualification.md#fixes-final-gate-and-cleanup) identifies exact restored provider settings, removed owned native records, closed/unregistered invented vault, stopped dedicated tmux/app and removed profiles/root. Unrelated Claude runtime drift and shared provider histories/index/cache references remain explicitly preserved. P5's separate archive and cleanup remain unchanged.

Native proof is scoped to Obsidian 1.13.7 and the recorded provider versions. Codex tool calls are retained, but its observed model was not retained and is not claimed. URL checks deliver explicitly to the owned app; global default registration and native cold-start ordering are unqualified, while startup queue/profile lifetime have focused regression coverage. These are explicit measurement boundaries, not substitutes for the demonstrated #38 criteria.

All P6 issue/epic closure is conditional on this report's final independent integration review and green gate. No required implementation or qualification work remains after those checks pass.
