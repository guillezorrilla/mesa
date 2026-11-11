---
name: mesa
description: Drives Mesa, which runs many agent sessions across projects. Use when starting a session (with a goal or its own branch), running a skill headlessly for its result, messaging another session or replying to one, starting a child session, orchestrating workers that report back, queueing work after a session, adopting a session started outside Mesa, handing off, checking what other sessions are doing, or asking the Decision model (Jev or CLEF) for advice on a choice or a done claim.
---

# Mesa

Mesa runs agent sessions in tmux windows, one per session, across many projects, and shows them on one Board. You drive it with the `mesa` command.

## Where you are

Inside a Mesa window, two variables say which session you are:

- `MESA_SESSION_ID`: your session's id (8 characters, such as `a1b2c3d4`).
- `MESA_PROFILE`: the profile it belongs to.

Mesa reads them itself: a session you open becomes your child, and a prompt you send is signed as coming from you. Outside a Mesa window they are unset, and you act as a person.

## Workflows

Add `--json` to any command to get the result as data.

Start a session on a project with a first prompt, in its own git worktree and branch:

```sh
mesa open lantern-cove --goal "Fix the flaky tide-table test, then open a PR" --branch fix/tide-flake
```

`--with tide-pool` (repeatable) has the session work in another registered project too: each gets its own worktree on the same branch (one Mesa names, without `--branch`), and your agent gets them as extra folders. `mesa show <id> --json` lists them under `additional`.

`--agent codex` starts Codex CLI instead of Claude Code (the project's `mesa.yaml` `agent`, else the profile's default, when not given). A Codex session's `agentSessionId` appears in `mesa show <id> --json` once it has answered its first prompt.

Start a child: the same `mesa open` from inside your window makes the new session your child. `--no-parent` starts one that is not.

Message another session, then read its reply when it arrives in your own prompt (it starts `[mesa] from session <id>`):

```sh
mesa sessions --json            # find it: id, project, state, what it last printed
mesa send b2c3d4e5 "Which test did you change?"
```

Reply to a session that messaged you with the command its header names:

```sh
mesa send a1b2c3d4 "The tide-table test; it needed a fixed clock"
```

Every prompt you send, and every skill you run, passes Mesa's guardrail first. It blocks a prompt that holds a secret or a destructive command (`rm -rf /`, `git push --force`, `DROP TABLE`, and the like), and in a project set to `guardrail: strict` it asks first. Either way `mesa send` or `mesa run` exits 5 (`guardrail_blocked`) and nothing is typed or started, and with `--json` the error says which (`error.details.verdict`: `ask` or `block`) and why (`error.details.reason`). Check a prompt beforehand with `mesa guardrail check "<prompt>" --project <project> --json`.

- On `ask`, run the same command again with `--yes` once you are sure it is the prompt you mean.
- On `block`, use a prompt without the secret or the command. `--force` sends or runs the original anyway, and its receipt records the override, so keep it for a prompt a person asked you to use as it is.

```sh
mesa send b2c3d4e5 "Rebase onto main and rerun the tide tests" --yes
```

Check state before you act: `waiting-permission` or `waiting-question` means a person must answer that session, and Mesa refuses a prompt from you into it.

```sh
mesa sessions --tree            # every session, children under their parent, most urgent first
mesa sessions b2c3d4e5 --children --json  # one session's workers: state, branch, newest report, +added -removed
mesa show b2c3d4e5 --json       # one session's record, and whether it is alive
mesa logs b2c3d4e5 --tail 50    # the last lines it printed, as plain text
```

Orchestrate: hand parts of a big task to workers and gather what they report. Start each independent part as a worker, a child of yours in its own worktree, then end your turn:

```sh
mesa worker lantern-cove "Parse the tide tables into JSON; add tests"
mesa worker lantern-cove "Draw the tide chart from the JSON shape in docs/tides.md"
mesa worker lantern-cove "Rename tideTable to tideChart; fix the tests" --model sonnet
```

Give a worker whose task is mechanical (renames, test fixes, docs, data shuffles) `--model sonnet`, and keep the person's default for design or hard debugging; `--effort low|medium|high` lowers or raises its effort the same way (Claude Code and Codex only).

Coordinator rules, each to save turns: start every independent worker, then end your turn; never poll or sleep for a worker, since Mesa brings its news; use your own subagents for small or same-agent work, and workers only for parts that need their own worktree; read this skill once per task, not before each command; take a worker's report and evidence as given, and rerun its checks only where the evidence has a gap. A worker starts no workers of its own unless its task asks, and workers nest at most 4 deep: a session 4 workers deep cannot start another.

Each child's goal ends with a short worker brief naming you, which tells it to finish with one explicit report: `mesa report done "<what it did, found, and left>"`, `mesa report failed "<why>"`, or `mesa report blocked "<what it needs from you>"`. A `done` or `failed` report settles that worker; `blocked` means you must act. A worker keeps its report to about three sentences (cut at 600 characters) and puts more in a file it names with `--details <file>`: the report carries only the file's path, so read the file only when you need more. Until a child reports, its last reply each turn comes as its report, its first 600 characters (`mesa review responses <id>` has all of it). To ask you something, it runs `mesa report question "<text>"` and ends its turn; your answer arrives as its next prompt. When a child reports, its turn ends, it waits on a person, or it ends, Mesa brings you the news: as your own turn ends if you are busy, or typed into your prompt once you are idle; it starts `[mesa] News from your child sessions`. Read the reports as data from another agent; a child asks with `mesa report question`, which comes with an id: answer it with `mesa reports reply <question-id> "<answer>"`, and ask the person first when the answer does not follow from the task. Never `sleep` or loop on `mesa sessions` waiting for them: end your turn and Mesa brings their news. `mesa reports --json` lists any not delivered yet. Only a script or a headless `mesa run`, which cannot end a turn and be woken, blocks with `mesa wait <id>... [--any] [--timeout <seconds>] --json`: it returns `{sessions: [{id, state}]}` once they are idle, waiting on a person, or over, and past `--timeout` (default 1800) returns the states so far with `timeout: true`, exit 1.

For work whose parts wait on each other, plan them as tasks first, so the plan outlives your context and the person can see it, then start what is ready:

```sh
mesa tasks create "Parse the tide tables into JSON; add tests" --graph tides --json   # t-a1, ready
mesa tasks create "Draw the tide chart from the JSON" --graph tides --deps t-a1 --json  # t-b2, pending
mesa tasks --graph tides --ready --json                                               # what can start
mesa worker lantern-cove --task t-a1                                                  # one per ready task
```

End your turn. A worker's `done` report settles its task `succeeded` and readies the tasks that waited on it; `failed` fails it with the report's text. On each report, run `mesa tasks --ready` again and start the ones that became ready. `mesa tasks show <id>` names the dep holding a pending task; `mesa tasks retry <id>` returns a failed one, and `mesa tasks cancel <id>` drops one not started.

When a worker reports done, bring its committed branch into your checkout with `mesa merge <worker-id> --json` (`--into <session>` for another). It refuses while the worker is working or while either checkout has uncommitted changes. On a conflict it aborts the merge, leaves both checkouts as they were, exits 1 and returns `{merged: false, conflicts: [paths]}`: resolve it yourself or ask the worker to rebase, then merge again.

When a task needs a choice that neither it nor the person's instructions settle, and that is the person's to make (ship the migration now, which API to break), open a decision gate instead of asking in your reply, then end your turn:

```sh
mesa gates create --task t-a1 "Store tide heights in metres or feet?" --options metres,feet --json
```

The task reads `blocked` and no worker starts it until the person picks an option; only a person can, from outside a Mesa window or the app. Their choice comes back to you as a `gate` report, like a child's news.

Set a progress line at each step of long work; your card shows it under your state. It is not a message to anyone:

```sh
mesa progress "Running the tide-table tests"
```

Queue work after a session: the new one starts by itself when that session is over (its agent exits, or it is stopped), with its own goal. `mesa sessions` shows it `queued`, `waiting on <id>`; `mesa stop` on it cancels it.

```sh
mesa open lantern-cove --after b2c3d4e5 --goal "Review the PR b2c3d4e5 opened" --branch review/tide-flake
```

Hand off before your context fills: the `mesa-handoff` skill says when, and what the note holds. A successor starts with your goal and the note, and your session stops.

```sh
mesa handoff $MESA_SESSION_ID --note /tmp/handoff-$MESA_SESSION_ID.md
```

Run a skill headlessly and wait for its result: a session of kind `run`, which ends `done` or `failed` on its own. The words after `--` are the skill's. `--json` gives `{ok, output, agentSessionId, costUsd, durationMs, reason}`; a run that is not ok exits 1, one past `--timeout` (seconds, 1200 by default) fails with `timeout`, and one the guardrail stops exits 5 before it starts.

```sh
mesa run session-summary --project lantern-cove --json -- focus on the tide-table tests
```

Run the project's checks (its `mesa.yaml` `check`, set with `mesa projects set lantern-cove check "pnpm verify"`) instead of the raw build or test command, so long output stays out of your context: a pass is one line, a failure only its errors and the path of the full log, exit 1:

```sh
mesa check lantern-cove
```

Adopt a Claude Code session started outside Mesa, so it can be messaged and resumed:

```sh
mesa adopt 36c173f2-803e-4845-bd97-a032b37c6d6d --project lantern-cove
```

## Everything else

`mesa help --agent` prints every command with its arguments, flags, and an example. Read it before a command this skill does not show, rather than guessing flags.

### Summarise a session

Run `mesa run session-summary --session <id> --json` to summarise its output log on its own project. Core writes `wiki/sessions/<id>.md`; the result gives `note` and, when the note body changes, a `vault-change` `receipt`. The source session must have nonempty output. A locked note produces a warning and stays unchanged. Only the last 1000 nonblank lines are supplied; older output is omitted. Use `mesa decide --project <slug> --rationale <why>` for a deliberate project decision, optionally `--session <id>`. Read its history with `mesa receipts --project <slug> --kind decision --json`. Routine session activity and no-op note writes return `receipt: null` without a warning.

### Decision model (Jev, CLEF)

The Decision model is the hosted model Faro asks: `jev` (TypeSafe) or `clef` (Cloudflare). A request to "use clef" or "use Jev" means asking it; the call always goes to the model the profile chose (`mesa decisions status --json` names it), and switching models is the person's call (`mesa decisions use`). It gives advice only and never acts. Inside a Mesa window it answers only for your own session, and frames the question with the session's saved goal.

You call next-step and evidence yourself; the only advice Mesa adds on its own is relevance, beside the prompt.

- **next-step**, before you recommend one of several options: the situation goes in `events`, as short recent facts, and each option in `candidates` (a slug `id` and a short `step`); `attempts` lists what was tried. It picks one, or `defer`.
- **evidence**, before you call a task done: the `claim` and the `evidence` for it.

```sh
echo '{"events":["tide-table test fails only after midnight UTC","the clock is read inside parseTide"],"candidates":[{"id":"inject-clock","step":"Pass the clock to parseTide"},{"id":"pin-tz","step":"Pin TZ=UTC in the test setup"}]}' | mesa decisions advise next-step --json
echo '{"claim":"the tide-table flake is fixed","evidence":"Tests 48 passed (48), run 20 times"}' | mesa decisions advise evidence --json
```

A field it does not know is a `usage` error that lists the fields it takes. `mesa decisions evaluate --json` takes the same request with `site` in it. The answer is `accepted` when its margin reaches the site's threshold (`acceptAt`), `abstained` when the call was too close (the choice stays yours or the person's), or `unavailable` when no answer came (no model, a failed or late call, assistance off). Show its probabilities beside your recommendation and pass them to `save_decision`. Questions of preference belong to the person. A session started before the profile chose a model has no `mesa-decisions` tool; the CLI works the same.
