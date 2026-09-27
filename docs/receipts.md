# Receipts

A receipt is the audit trail of one thing Mesa did: a markdown note in the vault's `receipts/`, its YAML frontmatter the record, its body a summary line and a `## Details` section. `writeReceipt` (packages/core/src/receipts/store.ts) validates the frontmatter with a zod schema before anything is written, and writes the note through `writeNote`, so a receipt is atomic and carries `created`, `updated`, and `source: mesa` like every note Mesa writes. `mesa receipts` lists the newest; `mesa receipts show <id>` prints one.

## Where receipts go

`receipts/YYYY/MM/<started>-<type>-<id>.md` in the profile's vault, with `<started>` in compact UTC to the second (`20260924T120000Z`): taken from the clock when the receipt is written, since the frontmatter's `started` keeps only minutes, or converted from `started` when a caller sets it. `mesa receipts` lists newest first by that stamp and then by id (a ULID starts with its millisecond time, so it orders receipts within one second); a file under `receipts/` whose name is not a receipt's is ignored.

Today `mesa init`, `mesa register`, `mesa unregister`, `mesa config set`, and `mesa vault init` each write an `action` receipt through `actionRecorder`: `ok` when they change something, none when they change nothing, and `failed` (with the error code and message in `outputs.error`) when they throw. A receipt never fails the action it records: when the vault cannot take one (the path is not a vault Mesa may write into, see `acceptsMesaWrites` in packages/core/src/vault/vault.ts), the command prints `warning: no receipt: ...` and `--json` shows `"receipt": null`. `mesa config set` keeps the path in `inputs.path` and the new value in `outputs.value`, `***` under `keys`, and writes none when the value is the one it had (defaults included); its `command` shows the value as `***` whatever the path, so a key set under a mistyped path, which fails, is not kept in the clear either. `mesa send` writes an `action` receipt whose `inputs.prompt`, and the prompt in its `command`, keep the first 80 characters (key values redacted); `inputs.from` is the `--from` given (`inputs.noFrom` with `--no-from`), and `outputs.from` the sender it had, or null. `mesa open` and `mesa resume` write a `session` receipt through the same recorder (`type: session`, with `session` and `agent`; a resume's `outputs.resumedFrom` names the old session). `mesa open` records `inputs.parent` and `inputs.noParent` when given, and `outputs.parent`, the parent it got (Parent session in CONTEXT.md). `mesa open --branch` records `inputs.branch` and `inputs.base` when given, and `outputs.worktree`, the worktree it runs in (Worktree in CONTEXT.md). `mesa rename` writes a `session` receipt with `outputs.name`, and `mesa rm` one with `inputs` (`force`, `deleteWorktree`, `deleteBranch`) and what it removed as `outputs`. `mesa skills sync` writes an `action` receipt with `inputs.project` and the diff as `outputs`, unless it changed nothing. `mesa adopt` writes a `session` receipt with `inputs.agentSessionId` (and `project`, `name`, `noResume` when given), and `outputs.window`, `outputs.resumed`, and `outputs.cwd` when the session runs outside the project's folder (Adopted session in CONTEXT.md). `mesa open --goal` keeps the goal the way `mesa send` keeps its prompt, in `inputs.goal` and its `command` (`receiptText` in packages/core/src/receipts/command.ts); a goal Mesa refuses gets a `failed` receipt. `mesa stop` writes one too, with `outputs.outcome` (`exited`, `killed`, `gone`, or `cancelled` for a queued session), unless the session was already stopped; it and a resume also mark the session's opening receipt `ended`, in place, under the vault lock. `mesa open --after` records `inputs.after`; its session receipt says `Queued session`, and the start, when it comes, writes its own `Started queued session` receipt (Queued session in CONTEXT.md), or a `failed` one that also marks the queued session's receipt ended. `mesa handoff` writes a `session` receipt with `outputs.from`, `outputs.to`, `outputs.note`, and `outputs.stop` (how the session stopped: an outcome, `later`, `kept`, or `failed`; Handoff in CONTEXT.md). `mesa hooks install` and `uninstall` write an `action` receipt when they change the settings. An action's own warning (skills not synced, a session not marked) joins the receipt's in `warning`, the action's first. Faro decisions write their receipts as those land (P3).

## The log line

Every receipt adds one line to the vault's `log.md`, in the append-only `- <ISO UTC> <text>` form, linking to it:

```markdown
- 2026-09-24T12:00:00.000Z Registered project lantern-cove [[receipts/2026/09/20260924T120000Z-action-01TEST00000000000000000001|receipt]]
```

The link is a wikilink to the receipt's path without `.md`, which Obsidian keeps working if the note is renamed. A receipt written before the vault has a `log.md` (from `mesa init`, before `mesa vault init`) is still written; the command prints `warning: no log line: ...` instead.

## Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `type` | yes | `session`, `skill`, `decision`, or `action` |
| `id` | yes | A ULID: 26 Crockford base32 characters, time first, so ids sort by time |
| `profile` | yes | The profile the receipt belongs to |
| `project` | no | The registered project's name |
| `session` | no | The Mesa session id |
| `agent` | no | `claude` or `codex` |
| `started` | yes | When the work started, in local time as `YYYY-MM-DDTHH:mm`, the form Obsidian infers as a Date & Time property (with seconds it infers text). The file name keeps the seconds. Receipts written before this form (#61) hold ISO UTC (`2026-09-24T12:00:00.000Z`); both are read |
| `ended` | no | When it ended, in the same form, for work that spans time (a session) |
| `status` | yes | `ok`, `failed`, or `blocked` (a guardrail stopped it) |
| `command` | yes | The mesa command line: the value after a `keys` or `keys.<name>` path, and every key value found in any word, become `***` |
| `decisions` | yes, may be empty | Every Faro answer behind the work, shaped by its primitive (ADR-0004). Every answer has `question`, `kind`, `answer`, `probabilities`, and `backend` (`rules`, `adapter`, `jev`, or `rules-fallback` when the named backend was asked and failed). `Choice`: the answer is the chosen option, `probabilities` maps each option to its probability, `confidence` is required. `Score`: the answer is a number, `probabilities` maps each rubric level, `confidence` is required. `Noul`: the answer is true or false, `probabilities` is one calibrated number, and there is no `confidence` |
| `inputs` | yes, may be empty | What the work was given |
| `outputs` | yes, may be empty | What it produced |
| `cost` | no | US dollars, for information (for example `total_cost_usd` from `claude -p`) |

`created`, `updated`, and `source` come from `writeNote`, not from the receipt schema; `created` and `updated` use the same local `YYYY-MM-DDTHH:mm` form. In Obsidian's properties panel `created`, `updated`, `started`, and `ended` show as Date & Time, the other flat fields as text; `decisions`, `inputs`, and `outputs` are nested, which the panel shows as raw JSON.

## One example per type

These are the golden files the tests compare against (packages/core/src/receipts/golden/), written by `writeReceipt` from the examples in `packages/core/src/receipts/receipts.examples.ts` with a fixed clock and sequential ids. A test fails if this page and the golden files drift apart.

### action

```markdown
---
created: 2026-09-24T12:00
updated: 2026-09-24T12:00
source: mesa
type: action
id: 01TEST00000000000000000001
profile: default
project: lantern-cove
started: 2026-09-24T12:00
status: ok
command: mesa register lantern-cove --create
decisions: []
inputs:
  dir: /src/lantern-cove
  create: true
outputs:
  path: /src/lantern-cove
  wroteMesaYaml: true
---
Registered project lantern-cove

## Details

None.
```

### session

```markdown
---
created: 2026-09-24T12:00
updated: 2026-09-24T12:00
source: mesa
type: session
id: 01TEST00000000000000000001
profile: default
project: lantern-cove
session: a1b2c3
agent: claude
started: 2026-09-24T09:30
ended: 2026-09-24T11:05
status: ok
command: mesa open lantern-cove
decisions: []
inputs: {}
outputs:
  turns: 14
  lastState: done
---
Session a1b2c3 on lantern-cove ended done after 1 h 35 min

## Details

Resumed once. Last output: "All tests pass."
```

### skill

```markdown
---
created: 2026-09-24T12:00
updated: 2026-09-24T12:00
source: mesa
type: skill
id: 01TEST00000000000000000001
profile: default
project: lantern-cove
agent: claude
started: 2026-09-24T12:00
status: failed
command: mesa run lantern-cove --skill tidy-readme
decisions: []
inputs:
  skill: tidy-readme
outputs:
  error: agent exited with code 1
cost: 0.042
---
Skill tidy-readme failed on lantern-cove

## Details

None.
```

### decision

```markdown
---
created: 2026-09-24T12:00
updated: 2026-09-24T12:00
source: mesa
type: decision
id: 01TEST00000000000000000001
profile: default
project: lantern-cove
session: a1b2c3
started: 2026-09-24T12:00
status: blocked
command: mesa send a1b2c3 "git push --force"
decisions:
  - question: Allow sending this prompt?
    kind: Choice
    answer: block
    probabilities:
      allow: 0.08
      ask: 0.22
      block: 0.7
    confidence: 0.81
    backend: rules
  - question: Is the prompt destructive?
    kind: Noul
    answer: true
    probabilities: 0.93
    backend: rules
inputs:
  prompt: git push --force
outputs: {}
---
Guardrail blocked a prompt to session a1b2c3

## Details

None.
```
