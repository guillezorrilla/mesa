# ADR-0023: Mesa captures a session's decisions when it ends

Status: accepted
Date: 2026-10-08

## Context

The vault policy asks agents to save their durable decisions with `save_decision`, and says itself that agents following it unprompted had not been shown. On 2026-10-08 one Claude Code session settled several durable decisions (#687's Inbox rules, #693's Ticket view model and Atlassian scopes) and saved none until the owner asked (#692). Saving cannot depend on the agent remembering.

## Decision

- When a Mesa session ends, Mesa captures it: one detached Skill run of the pipeline skill `vault-capture` over its native conversation, started from the end signals Mesa already has (the agent's SessionEnd hook, tmux's pane-died, a stop, a Board look that finds an exit no signal reported). The session record claims the capture under its lock, so a session's several end signals start one run; a claim whose run never started is taken again after 10 minutes. It is on by default; `mesa config set vault.capture off` turns it off.
- The run only returns JSON, at most 5 decisions and notes; core lands them when the run ends (ADR-0006: the agent never writes the vault), all or none under one vault lock, updating the note that already covers an item instead of adding a second: only Mesa's unlocked note of the same type and exactly the same title, case aside, so a related note on another point is never written over, and never a person's or a locked note. No Decision model is asked which note covers an item: a wrong pick would overwrite a decision, and the next-step site accepted exact-title-only (p=0.82).
- One capture is one receipt of a new kind, `capture`, listing its notes and each decision's probabilities and confidence. A failed capture is kept as a failed `capture` receipt and on the session record, so the person can see why nothing was saved; it is not meaningful history.

## Evidence

- `packages/core/src/vault/capture/capture.test.ts`: a SessionEnd twice and pane-died start one run; a forced stop and a Board look that finds a missed exit start one; a claim with no run is taken again only after 10 minutes; a newest message over the budget is kept, clipped; it lands a decision and a note under one receipt with their odds; a same-title note (case aside) is updated, not duplicated; a related decision of another title stays intact, and no model is asked; a person's note is never written over; `[]` saves nothing and keeps no receipt; a failed run or bad output changes no note and says why in the record and the receipt; runs, terminals, Antigravity, General, no conversation, no vault, and capture off start nothing.
- `packages/core/src/vault/bases.test.ts`: the Meaningful Bases filter and `meaningfulReceipt` agree on `capture`.

## Consequences

- Receipts of kind `capture` stay in vaults; a later change of this policy must keep reading them.
- Every interactive Claude Code or Codex session that ends with a conversation costs one headless run on the project's agent.
- A capture reads only the newest 100,000 characters of a long conversation, the newest message clipped to them when it alone is longer.
- A capture that restates a decision under a new title adds a second note beside the first; the person merges them.

## Amended 2026-10-08: once per new messages (#702)

Once per session became once per new messages. A capture that lands marks the newest message it was given (`through` on the session's `capture`; the claim holds the run's `upTo` until then); a later end of the session, or of one resuming it, captures only the messages newer than that mark and starts nothing when there are none; a failed capture keeps the mark, so the next end tries the same messages again; a capture that landed before marks were kept covers everything up to its `at`. A Board look captures only an exit it found itself, so a failed capture is not retried on every look. A capture by hand uses the same mark, a Claude background session's exit found by the Board is captured too, and with capture off nothing past the switch is read. Decided in the vault on 2026-10-08, the next-step site's CLEF answer accepted at p=0.93.

Evidence: `packages/core/src/vault/capture/capture.test.ts`: a landed capture records `through` and `mesa show` prints it; a resumed session's end gives its run only the newer messages, and with none starts no run; a failed capture keeps the mark and the next end retries; a capture by hand of a live session, then its end, captures only what was said after; a background session's exit found by a Board look starts its capture; with capture off an end reads no transcript.

## Amended 2026-10-15: at turn end, throttled (#844)

A session is captured as it goes, not when it ends. Capturing at the end made archive and Delete permanently wait while the transcript was read and a run started, and `mesa rm` kept a Removing record until the capture landed; since captures are incremental (`through`), capturing mid-session saves nothing twice. The owner decided: capture at turn end, throttled; archive and delete never capture.

- A turn's end, the parent agent's `Stop` hook for Claude Code and Codex, starts a capture only when due: capture on, a laid-out vault, an interactive Claude Code or Codex session on a project, its last capture (else its start) at least `CAPTURE_EVERY_MS` (20 minutes) ago, a conversation, and at least `CAPTURE_MIN_MESSAGES` (10) messages newer than its mark. The checks run cheapest first, and the clock before any transcript is read, as the hook runs inside the agent's turn. Both constants live beside the claim, `packages/core/src/vault/capture/claim.ts`.
- No end signal starts a capture: SessionEnd, pane-died, a stop, a Board look, archive and `mesa rm` (the app's Delete permanently). `mesa rm` removes the record at once; the Removing record, `sessions/removing/`, and its sweep are gone. A capture still running when its session is removed lands nothing.
- `mesa vault capture <id>` still captures whatever is newer than the mark, however few messages and however recent the last capture.
- What a session said after its last due turn is not captured when it ends; a later turn of the session, or of one resuming it, or a capture by hand takes it.

Evidence: `packages/core/src/vault/capture/capture.test.ts`: a Stop with 10 new messages and no capture in 20 minutes starts one run, and a second Stop while it runs starts none; a Stop inside 20 minutes of the last capture, or with fewer than 10 new messages, starts none; SessionEnd, pane-died, a stop, a forced stop, a Board look, archive and rm start none and read no transcript; a turn that is not due (capture off, or inside 20 minutes) reads no transcript, with a transcript read that fails; a capture by hand runs past the throttle; a session removed while its capture runs is removed at once and its run lands nothing; a Claude background session's exit found by a Board look starts no capture. `packages/core/src/sessions/end/remove.test.ts`: `mesa rm` reports no capture.

## Amended 2026-11-10: a stricter bar, at most 3 items (#880)

Captures were saving too much. Since 2026-10-08, 454 of the profile's 456 captures saved something, 3.3 items each on average, and capture wrote 91% of the vault's new wiki items. In a sample of 52 recent items, 16 were noise: a pull request's review state after a round, status true only for now, what one verify run showed, and details of one file that belong in a code comment. Another 6 restated a decision the same session had saved a capture earlier. The owner decided on a stricter bar: the `vault-capture` skill now keeps an item only when it will still matter in a month and lives nowhere better. It lists what to drop with examples, treats `[]` as the usual answer, folds the points of one design into one decision, asks for titles of 60 characters or less, and returns at most 3 items. `CAPTURE_MAX_ITEMS` (`vault/capture/items.ts`) keeps the first 3 of a run that returns more. The bar lives in the skill alone, and core still lands whatever passes it.

Evidence: `packages/core/src/vault/capture/capture.test.ts`: a run that returns more than 3 items keeps its first 3. `skills/vault-capture/SKILL.md` holds the bar.

## Amended 2026-11-10: a capture updates its own session's note (#883)

A session captured every 20 minutes often changed or extended a decision it had saved one capture earlier. The next capture then saved the changed version under a new title beside the first, because only a note of exactly the same title is updated. A capture item may now name the note it replaces, `updates: <path>`. Core accepts the path only when that note is under the project's `wiki/`, of the item's type and project, Mesa's, not locked, and saved by the captured session itself (`session` in its frontmatter). In every other case the item is matched by title as before. A capture never replaces another session's note on purpose: the owner chose the same-session rule over letting a capture name any Mesa note (the next-step site scored `same-session-update` p=0.83 against `any-mesa-update` 0.02, `prompt-only` 0.09 and `defer` 0.06; vault decision 2026-11-10 "Vault capture: tighter bar, same-session update, word names"). The reason is the original one: a wrong pick would overwrite a decision, and the vault keeps no history of it. A resumed session's notes carry the session it resumed, so it falls back to title matching for those.

Evidence: `packages/core/src/vault/capture/capture.test.ts`: a capture replaces the note its own session saved that it names, whatever its title, and adds none. It never replaces a note another session saved, a locked one, or one outside `wiki/`: it saves its own, and those stay byte for byte.

## Amended 2026-11-10: captures run on Haiku (#908)

A capture ran on the person's default model, Opus on the owner's profile, and cost about $0.82 a run: $380 over 463 runs in five weeks, mostly session overhead re-read across about 10 turns. Six windows no capture had seen yet were replayed through the stricter skill (#880) with mesa-vault's read tools live. Opus kept about 4 items that pass the bar, at $0.78 a run. Haiku recalled 2 of them and added 6 that Opus dropped, at $0.04 a run. Sonnet recalled 1, at $0.31. The owner chose Haiku: Mesa passes `--model 'haiku'` to a `vault-capture` run (`claudeRunModel`, `packages/core/src/skills/library.ts`), and every other skill run keeps the person's default. Codex and Antigravity runs take no model from Mesa. Decided in the vault on 2026-11-10; the next-step site's CLEF answer abstained (haiku 0.37, more samples 0.23, sonnet 0.18, keep Opus 0.08). Numbers are in `docs/spikes/token-usage.md`.

Evidence: `packages/core/src/vault/capture/capture.test.ts`: a capture's launch carries `--model 'haiku'`; the exact launch string in `packages/core/src/sessions/run/run.test.ts` shows a session-summary run carries no model.

## Amended 2026-11-10: every Mesa skill run on the cheapest model that does the job (#1000)

The owner's rule: use a cheaper model whenever it makes sense. `claudeRunModel` now maps each of Mesa's own skill runs: `git-text` and `session-summary` on Haiku (short text from given input, as a capture is), `import-notes` on Sonnet (it reads and writes several vault notes), `vault-capture` on Haiku as above. Any other skill run keeps the person's default; Codex and Antigravity runs still take no model from Mesa.

Evidence: `packages/core/src/sessions/run/run.test.ts`: the session-summary launch carries `--model 'haiku'`, an import-notes launch `--model 'sonnet'`, and the mapping test covers every skill and the default.

## Amended 2026-11-11: Haiku confirmed against Sonnet (#1057)

Captures stay on Haiku, and Sonnet is no longer the fallback the #908 amendment named for when noise rises. On 10 real windows that no capture had seen, blind-graded against #880's bar, both models found the one decision and neither kept passing status. Haiku also kept the one note and 5 duplicates of vault notes, at $0.07 a run. Sonnet kept 3 duplicates at $0.44 a run, and 4 of its 10 first answers did not read. The skill's restatement rule gained examples (a decision the session saved itself, one another session made and this one relays) and a whole-vault search for another project's items. With those, Haiku returned 1 duplicate where it had returned 5. `captureItems` now reads a null optional field as left out. The owner chose Haiku; the next-step site's CLEF answer agreed (keep Haiku p=0.94, more samples 0.03, Sonnet 0.01). Numbers are in `docs/spikes/capture-model.md`.

Evidence: `packages/core/src/skills/library.test.ts` and `capture.test.ts` pin `--model 'haiku'` on a capture's launch; `capture.test.ts`: a run that writes a left-out field as null reads as if it left it out.
