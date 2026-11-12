# Spike: which model runs a vault capture

Date: 2026-11-11. Issue: #1057. Decision: captures stay on Haiku. Only aggregate numbers are written here; the inputs, the items and the grades stayed on the owner's machine.

## Question

#909 moved `vault-capture` runs to Haiku on six windows. A demo capture on Haiku then kept passing environment state and missed the decision its session settled. Does Sonnet follow #880's bar better, on enough real inputs to tell?

## Method

- Harness: `pnpm vault:capture-model --sessions <ids> --out <dir outside the repo>` (`scripts/vault/capture-model.mjs`, not part of `pnpm verify`). For each session it builds the input a capture would read now (`captureInput`: the messages newer than its last capture), then runs the launch a capture gets (`--model <m>`, the lean flags, mesa-vault with its write tools disallowed) once per model. Nothing lands; `--report <grades>` prints the table below.
- Inputs: 10 Claude Code sessions on 6 projects in the owner's `default` profile, each with 16 to 107 messages since its last capture, 12k to 100k characters of input. Windows already captured were not usable, since their items are in the vault and every model drops them.
- Two differences from a real run, the same for both models. The run starts in a scratch folder with the repo's `skills/vault-capture` and adds the project with `--add-dir`, because a project's own link to the installed skill library wins over `--add-dir`, and three of the six projects had one. mesa-vault binds to a live session on the same project, as a real run's server binds to the run's record on that project.
- Grading: five agents graded two inputs each, blind to which model wrote which run. Each read the whole input, the skill's bar and the vault, listed what the window settled that passes the bar, and graded every returned item: keep, should drop, or duplicate (the vault already says it, or the run says it twice). The owner was shown a sample of four grades, including the closest call, and accepted them.
- A failed capture keeps its mark, so the next due turn retries the same messages (ADR-0023). A run whose output did not read was run once more, and the table counts its retry's items and both runs' cost and time.

## Result

Across the 10 windows, 1 decision and 1 note pass the bar. The rest of each window is pull request rounds, one-run results, or points the vault already holds.

| Model | Runs | Items | Kept, pass the bar | Wrongly kept, should drop | Wrongly kept, duplicate | Decisions missed | Cost per run | Time per run | Unreadable first tries |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Haiku | 10 | 7 | 2 | 0 | 5 | 0 | $0.066 | 20 s | 0 |
| Sonnet | 10 | 4 | 1 | 0 | 3 | 0 | $0.440 | 12 s | 4 |

- Both models found the one decision, and neither kept passing status. The demo's two failure modes did not recur under #880's bar.
- Sonnet missed the one note Haiku kept. That note is the closest call in the set: a reusable gotcha that the session stated but never saw happen.
- Every item Haiku kept wrongly was a duplicate. In reruns its titles matched the vault notes' names, so it had found each note and returned the session's fuller account of the same point anyway.
- Sonnet costs 6.7 times as much. 4 of its 10 first tries did not read: 3 were not a JSON array and 1 wrote `"confidence": null`. Without the retries it averages $0.31 and 8 s.

## Choice

Haiku stays. It recalls at least as much as Sonnet, at about a seventh of the cost, and its only kind of error is a duplicate, which the skill can fix. The Decision model's next-step answer (CLEF): keep Haiku and add duplicate examples p=0.94, more samples 0.03, defer 0.02, move to Sonnet 0.01. The owner agreed.

## What fixed Haiku's duplicates

The bar itself is unchanged. `skills/vault-capture/SKILL.md` gains:

- a step: search again with other words when the first search finds nothing, and search the whole vault (`all`) when the item is about another project (one duplicate was a decision that another project's session made and this window only relayed, and `search_vault` searches only the session's project by default);
- a restatement rule: a fuller account of a point the vault holds, or more detail on it from this conversation, is still a restatement;
- two examples for the restatement rule: a decision the session saved itself with `save_decision`, and a decision another session settled that this conversation only relays;
- in the opening, "Mesa saves it, finds the note that already covers each item" became "cannot find in the vault yet; Mesa saves it". The old wording told the model that Mesa would merge any repeat.

Separately, `captureItems` (`vault/capture/items.ts`) now reads a null `probabilities`, `confidence` or `updates` as left out. Three unreadable runs wrote null for one of these fields: one of Sonnet's first tries, and two of Haiku's runs after the skill change.

Haiku on the same 10 inputs after both changes:

| Model | Runs | Items | Kept, pass the bar | Wrongly kept, should drop | Wrongly kept, duplicate | Decisions missed | Cost per run | Time per run | Unreadable first tries |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Haiku | 10 | 2 | 1 | 0 | 1 | 0 | $0.069 | 24 s | 0 |

It keeps the decision and drops 4 of the 5 duplicates. The one left restates a decision the session had saved by hand earlier in the same window. It no longer keeps the marginal note.

## Caveats

- One run per model per input. Model output varies between runs: during the skill edits, one Haiku rerun returned an unterminated string, and that output does not read even with the null fix.
- 10 windows held only 2 items worth keeping, so recall rests on very few items. The duplicate counts carry most of the signal.
- The after-change graded items were checked against the topics the blind graders had already judged, not graded blind again.
- The owner's installed app (0.3.12) predates #880 and #909, so its skill library still has the old bar, and its captures still run on the default model until the next release.
