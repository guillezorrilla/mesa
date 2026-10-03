# Receipts

A receipt is a Markdown note in the profile vault's `receipts/`. Since #274, new receipts record durable knowledge: a deliberate Faro decision with its rationale, a guardrail block or override, or an actual change to a vault note or the profile's vault. Routine session lifecycle, sends, configuration other than a vault switch, polls, no-op retries, and failures outside a guardrail do not create receipts. A command may therefore return `receipt: null` without a warning. A required receipt that cannot be written gives a warning while preserving the action result. Existing receipts remain readable through `mesa receipts` and `mesa receipts show`.

`kind` identifies the new policy's entries: `decision`, `guardrail`, `vault-change`, `refresh`, and `connection` (a Source connected or disconnected, CONTEXT.md, Connection). Older receipts have no `kind`; they retain their `type` (`session`, `skill`, `decision`, or `action`) and remain readable. `mesa receipts [--project <slug>] [--session <id>] [--kind <kind>] [--type <type>] [--limit <n>] --json` filters at the core store and lists newest first. The desktop shows the same filtered entries in project and session context, with direct links to the changed vault note. It has no global receipt feed.

## What is kept

- `mesa decide --project <slug> --rationale <text>` records the questions, answers, probabilities, and rationale. `--session <id>` narrows it to that project session; inside a Mesa session of the named project, the caller is used when `--session` is absent. A decision without project context is still available through the CLI; it does not appear in a project context.
- `mesa send` and `mesa run` record guardrail blocks and explicit `--yes`, interactive confirmation, or `--force` overrides. Ordinary allows create no receipt. The receipt keeps the guardrail decisions and override, not a raw terminal tail.
- A session start (open, resume, fork, adopt, a handoff's successor, a queued start) whose profile launch defaults turn off its agent's permission checks or sandbox (`--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox`, `--sandbox=danger-full-access`) records a `guardrail` receipt with those flags as `outputs.dangerousFlags`. Any other start records nothing.
- A completed `session-summary` or `project-brief` run records a `vault-change` only when its target note body changes. Its `inputs.target` and `outputs.target` name the exact vault-relative note, such as `wiki/sessions/a1b2c3d4.md`. The note and receipt are linked from `log.md`. Duplicate completion, an identical body from another run, and a failed or locked note write add no history.
- `mesa vault save decision|summary|note` (Session write in CONTEXT.md) records one `decision` receipt for a saved decision, its rationale, probabilities, and confidence in `inputs`, or one `vault-change` for a saved summary or note, each only when the note's own content changed. `inputs.target` and `outputs.target` name the note, and the receipt's `actor` is the calling Mesa session. The same save again, a timestamp-only difference, the `index.md` line of a new note, and a refused or locked save add no history; a retry after an interrupted log append puts the receipt's line back once, and one after a save interrupted before its receipt records that receipt once.
- `mesa sources connect <source>` records a `connection` receipt with `inputs.source` and `outputs.source` and `outputs.sites` (the site names), and `mesa sources disconnect <source>` one with `outputs.source` when it removed a Keychain item. Neither holds a token or anything about the account. A failed sign-in, or a disconnect with nothing to remove, adds no history.
- `mesa import` and `mesa import refresh` record one `vault-change` receipt per import, with `inputs.project` and `inputs.notes`, and `outputs.items` (each item's `source`, `id`, `title`, `url`, `snapshot`, and `note` when one was written), `outputs.notes` (the Write notes run's `ok`, `session`, and `reason`), and `outputs.target` (the first note, else the first snapshot). The snapshots are a change, so an import whose notes failed still has its receipt; one that stops before writing (an unsupported or inaccessible link) has none.

Session records and run outputs remain under `~/.mesa/<profile>/sessions/`. Their terminal output logs stay local; no raw terminal tail is copied into a new receipt. The note writer still uses an atomic rename, rejects locked notes, and keeps writes inside the vault, including through symlinks. The vault lock serializes note updates and receipt/log pairing. The app uses `mesa vault open <target>` to open a changed note in Obsidian.

`mesa import refresh --changed-only` keeps one `refresh` audit even when nothing changed. Its outputs list `checked`, `skipped`, and `refreshed` ids alongside the ordinary import results. An unchanged check writes no snapshot and runs no agent. The audit stays readable through the receipt APIs; Daily and the Meaningful Bases views include it only when content refreshed or notes were written. Notes batches, when needed, are recorded in `outputs.notesRuns`; `notesRetried` identifies pending notes retried without another snapshot and `notesWritten` counts notes actually landed.

## Where receipts go

The owner chose both vaults for `mesa config set vault <new>` (#152): after a successful change, Mesa writes one `action` receipt with `kind: vault-change` to the vault it leaves and one to the vault it selects. Each has its own id, `inputs.vault` (the previous vault), and `outputs.value` (the new vault), with home paths and configured secrets redacted. Existing receipts stay where they are. The command's returned `receipt` points to the new vault's entry. Setting the same path again, or an invalid setting, writes neither receipt. If either write fails, Mesa still attempts the other and preserves the successful config change, returning the write warning; the new entry is `receipt: null` if its write failed. Other configuration changes remain routine and create no receipt.

`receipts/YYYY/MM/<started>-<type>-<id>.md` in the profile vault, with `<started>` in compact UTC to the second (`20260924T120000Z`). `writeReceipt` validates the frontmatter before writing through `writeNote`. It adds one linked line to `log.md` when that file exists. A receipt written before `log.md` exists still survives, with a warning about the missing log line. Receipt files and earlier examples below use the same schema; only the selection policy changed.

## Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `type` | yes | `session`, `skill`, `decision`, or `action` |
| `kind` | no | New entries use `decision`, `guardrail`, `vault-change`, `refresh`, or `connection`; absent on historical receipts |
| `id` | yes | A ULID: 26 Crockford base32 characters, time first, so ids sort by time |
| `profile` | yes | The profile the receipt belongs to |
| `project` | no | The registered project's name |
| `session` | no | The Mesa session id |
| `actor` | no | The calling Mesa session id when known; for a vault change, the run session id |
| `agent` | no | `claude` or `codex` |
| `started` | yes | When the work started, in local time as `YYYY-MM-DDTHH:mm`, the form Obsidian infers as a Date & Time property (with seconds it infers text). The file name keeps the seconds. Receipts written before this form (#61) hold ISO UTC (`2026-09-24T12:00:00.000Z`); both are read |
| `ended` | no | When it ended, in the same form, for work that spans time (a session) |
| `status` | yes | `ok`, `failed`, or `blocked` (a guardrail stopped it) |
| `command` | yes | The mesa command line: the value after a `keys` or `keys.<name>` path, and every key value found in any word, become `***` |
| `decisions` | yes, may be empty | Every Faro answer behind the work, shaped by its primitive (ADR-0004), its numbers to 6 decimals. Every answer has `question`, `kind`, `answer`, `probabilities`, and `backend` (`rules`, or `rules-fallback` when the named backend was asked and failed; receipts written before ADR-0020 may say `adapter`). `Choice`: the answer is the chosen option, `probabilities` maps each option to its probability, `confidence` is required. `Score`: the answer is a number, `probabilities` maps each rubric level, `confidence` is required. `Noul`: the answer is true or false, `probabilities` is one calibrated number, and there is no `confidence` |
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
  events:
    send: 14
    exited: 1
  lastState:
    state: done
    confidence: 0.85
    at: 2026-09-24T11:05:00.000Z
    source: tmux-hook
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
session: a1b2c3d4
agent: claude
started: 2026-09-24T12:00
ended: 2026-09-24T12:01
status: failed
command: mesa run tidy-readme --project lantern-cove
decisions: []
inputs:
  skill: tidy-readme
  args: []
outputs:
  agentSessionId: 00000000-0000-4000-8000-000000000001
  durationMs: 60000
  output: ~/.mesa/default/sessions/runs/a1b2c3d4.json
  reason: claude exited with status 1
  events:
    exited: 1
  lastState:
    state: failed
    confidence: 1
    at: 2026-09-24T12:01:00.000Z
    source: mesa
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
started: 2026-09-24T12:00
status: ok
command: mesa decide
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
  state:
    prompt: git push --force
outputs:
  latencyMs: 0
---
Faro answered 2 questions (rules)

## Details

None.
```

Decision question ids, answers, and probability labels redact configured secrets and the home path. Labels that redact to the same text gain numbered suffixes, keeping every probability intact. Output notes keep the run completion time in `endedAt`; a delayed retry repairs its log entry without replacing a newer completion.
