# Spike: per-turn relevance that stays silent on unrelated prompts

Issue: #692. Date: 2026-10-08.

**Outcome:** an automatic relevance ask now offers the model only sources that share at least two content words with the prompt, and asks nothing when none does. Live with CLEF over the invented vault: off-topic prompts that got a note went from 1 of 10 to 0 of 10, meta prompts from 5 of 10 to 2 of 10, and on-topic prompts from 8 of 10 (each the right note) to 10 of 10 (each the right note), at a tenth of the cost. Jev was not measured: the profile holds no TypeSafe key.

## Why the old path never abstained

On 2026-10-08 a live CLEF session got "Most relevant: <the vault-memory policy note>" on 8 of 8 unrelated prompts (#692, first comment). The cause is the candidate set, not the model:

- `scopedContext` (`decisions/context.ts`) offers vault search hits, then the project's listed decisions and notes, up to 10.
- `searchVault` needs every word of the query, so a whole prompt almost never hits, and the 10 candidates are simply the project's newest decisions and notes, whatever the prompt.
- Among 10 unrelated notes, the model picks the most general one, here a note about saving decisions. Its margin over `none` cleared the 0.5 threshold.

## The change

- `decisions/shared-words.ts` (`sharedWords`): the content words a query and a text share. A content word is a lowercased run of letters or digits, 4 or more long, that is not on a short list of common words. No stemming.
- In automatic mode (the per-turn hook, and `prepare`, which readies the saved goal's answer for the first turn), `scopedContext` keeps a source only when its title and excerpt, as the packet sends them, share at least 2 content words with the query. With none kept, the evaluation is unavailable ("no source shares 2 words with the query"), no model is asked, and `turnAdvice` sends nothing.
- Asked on demand (`decision_evaluate`, `mesa decisions context`), the candidates are unchanged: the agent or person chose to ask.
- An accepted answer's advice names up to 3 shared words as its reason, for example (margin and model vary): `Most relevant: note:wiki/decisions/2026-09-10-sprint-board-refresh.md (margin 0.80, clef), because it shares "sprint", "board", "refresh" with the prompt. Read it before relying on it.`

## The invented vault and prompts

Fixtures: `packages/core/src/decisions/fixtures/relevance/`. All content is invented.

- `vault/`: the lantern-cove project, a tide table and harbour app. One hub, 6 decisions and 6 notes. Two of them are general notes about the vault itself, the shape that over-ranked: `2026-09-12-proactive-vault-memory.md` ("agents save durable decisions to the vault...") and `second-brain-verification.md`.
- `prompts.json`: 10 off-topic prompts (a Slack message, a TypeScript error, a CSS question), 10 meta prompts (about deciding, issues, saving), and 10 on-topic prompts, each naming the note it is about.

## Candidates offered (no model)

Measured with the fake model of `@mesa/core/testing`. Before means the candidate set as it was, which on-demand mode still uses. A prompt "asks" when at least one candidate is offered, so a model is called.

| Group | Before: prompts that ask | Before: candidates offered | After: prompts that ask | After: candidates offered |
| --- | --- | --- | --- | --- |
| Off-topic | 10 of 10 | 100 | 1 of 10 | 1 |
| Meta | 10 of 10 | 100 | 2 of 10 | 3 |
| On-topic | 10 of 10 | 100, its own note among them for 8 | 10 of 10 | 10, its own note alone for each |

- The off-topic prompt that still asks shares 2 words with the release checklist ("bump", "version").
- The 2 meta prompts that ask both reach the vault-memory note. This is arguably right: they are about saving a decision, and the advice now says which words tie them.
- Before, 2 on-topic notes were never offered at all: the project lists 12 sources and the cap is 10, and no search hit lifted them. After, each on-topic prompt offers its note, and only that note.

`context.test.ts` holds both results as a regression test: per turn, at most 1 off-topic prompt is asked, and each on-topic note is offered.

## Live runs (CLEF; Jev not measured)

Harness: `packages/core/src/decisions/relevance-live.test.ts`, skipped unless `MESA_LIVE_RELEVANCE` names the models. It runs the per-turn path (scoped context, an automatic evaluation, `turnAdvice`) for each prompt per model, in a throwaway profile over the invented vault, and prints counts, latency and cost only. It reads the model key from the `default` profile's Keychain item (`mesa-default-decisions`) through a read-only secret store, and CLEF's account ID from that profile's config; it writes nothing outside its temp folder.

```sh
MESA_LIVE_RELEVANCE=clef TZ=UTC pnpm --filter @mesa/core exec vitest run src/decisions/relevance-live.test.ts
```

Before: the same harness, fixtures and `testing/decisions.ts` helpers in a temporary worktree of `main` (the previous `decisions/context.ts`). After: this branch. Run 2026-10-08, with the owner's approval to read the key.

| Model | Group | Before: got a note | After: got a note | Right note (on-topic) before / after | Calls before / after | Latency total before / after | Cost total before / after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| clef | Off-topic | 1 of 10 | 0 of 10 | | 10 / 1 | 4.5 s / 0.5 s | $0.0024 / $0.00005 |
| clef | Meta | 5 of 10 | 2 of 10 | | 10 / 2 | 4.2 s / 0.8 s | $0.0024 / $0.00012 |
| clef | On-topic | 8 of 10 | 10 of 10 | 8 / 10 | 10 / 10 | 4.0 s / 3.8 s | $0.0024 / $0.00049 |

- Off-topic meets the bar (at most 1 of 10) with room: the one off-topic prompt that still asks (the version bump) got `none`.
- On-topic keeps, and raises, its hit rate: each on-topic prompt now offers only its own note, and the 2 notes the old cap of 10 never offered are reached.
- The 2 meta prompts that get a note both get the vault-memory note, now with the shared words as the reason.
- Jev: not measured. The `default` profile holds no `typesafe` key; the owner chose CLEF only. With the gate, the 9 off-topic prompts with no candidate call no model at all, so they get no note whatever Jev would answer.

## Live vault capture (counts only)

Run 2026-10-08 in a throwaway profile with an invented project and a scratch vault, using this branch's CLI (the tmux pane-died hook runs the CLI that started the session). The profile, its tmux server, the scratch folders and their Claude transcripts were deleted afterwards.

| Session | What it was asked | Asked to save | Notes saved | Receipts |
| --- | --- | --- | --- | --- |
| 1 | Make and state one design decision, then `/exit` | No (told not to save) | 1 under `wiki/decisions/` | 1 `capture` receipt |
| 2 | Read one file and say what it does, then `/exit` | No | 0 | 0 |
| 1 again, by hand (`mesa vault capture`) | | No | 0 new: the decision was already covered | 0 |

Before this change, neither session would have saved anything: no decision reached the vault without the agent or the person asking (#692). After it, 1 of 1 stated decisions reached the vault, and the session that decided nothing saved nothing.

## Limits

- Word overlap is a lexical gate. A prompt that means a note without sharing two of its words ("the app forgets my harbour" against the onboarding note) gets no advice; a prompt that shares two incidental words (the eslint version bump) still asks the model, which may answer `none`.
- No stemming: "decision" and "decisions" are different words. That keeps the gate strict, and the reason it names is always words the prompt used.
- 10 prompts per group over one invented vault is small; a real vault has more notes and more incidental overlap.
