# ADR-0023: Mesa captures a session's decisions when it ends

Status: accepted
Date: 2026-10-08

## Context

The vault policy asks agents to save their durable decisions with `save_decision`, and says itself that agents following it unprompted had not been shown. On 2026-10-08 one Claude Code session settled several durable decisions (#687's Inbox rules, #693's Ticket view model and Atlassian scopes) and saved none until the owner asked (#692). Saving cannot depend on the agent remembering.

## Decision

- When a Mesa session ends, Mesa captures it: one detached Skill run of the pipeline skill `vault-capture` over its native conversation, started from the end signals Mesa already has (the agent's SessionEnd hook, tmux's pane-died, a stop whose agent exits). The session record claims the capture under its lock, so a session's several end signals start one run. It is on by default; `mesa config set vault.capture off` turns it off.
- The run only returns JSON, at most 5 decisions and notes; core lands them when the run ends (ADR-0006: the agent never writes the vault), all or none under one vault lock, updating the note that already covers an item (found by vault search, and with a Decision model, Faro's relevance answer) instead of adding a second, and never a person's or a locked note.
- One capture is one receipt of a new kind, `capture`, listing its notes and each decision's probabilities and confidence. A failed capture is kept as a failed `capture` receipt and on the session record, so the person can see why nothing was saved; it is not meaningful history.

## Evidence

- `packages/core/src/vault/capture/capture.test.ts`: a SessionEnd twice and pane-died start one run; it lands a decision and a note under one receipt with their odds; a same-title note is updated, not duplicated; a person's note is never written over; `[]` saves nothing and keeps no receipt; a failed run or bad output changes no note and says why in the record and the receipt; runs, terminals, Antigravity, General, no conversation, no vault, and capture off start nothing; with Jev, its relevance answer picks the note that is updated and lands in the receipt.
- `packages/core/src/vault/bases.test.ts`: the Meaningful Bases filter and `meaningfulReceipt` agree on `capture`.

## Consequences

- Receipts of kind `capture` stay in vaults; a later change of this policy must keep reading them.
- Every interactive Claude Code or Codex session that ends with a conversation costs one headless run on the project's agent.
- A capture reads only the newest 100,000 characters of a long conversation.
