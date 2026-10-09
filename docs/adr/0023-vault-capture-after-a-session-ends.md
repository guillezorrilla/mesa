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
