---
name: mesa
description: Drives Mesa, which runs many agent sessions across projects. Use when starting a session (with a goal or its own branch), running a skill headlessly for its result, messaging another session or replying to one, starting a child session, queueing work after a session, adopting a session started outside Mesa, handing off, or checking what other sessions are doing.
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
mesa show b2c3d4e5 --json       # one session's record, and whether it is alive
mesa logs b2c3d4e5 --tail 50    # the last lines it printed, as plain text
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

Adopt a Claude Code session started outside Mesa, so it can be messaged and resumed:

```sh
mesa adopt 36c173f2-803e-4845-bd97-a032b37c6d6d --project lantern-cove
```

## Everything else

`mesa help --agent` prints every command with its arguments, flags, and an example. Read it before a command this skill does not show, rather than guessing flags.

### Summarise a session

Run `mesa run session-summary --session <id> --json` to summarise its output log on its own project. Core writes `wiki/sessions/<id>.md`; the result gives `note` and the finished skill `receipt`. The source session must have nonempty output. A locked note produces a warning and stays unchanged. Only the last 1000 nonblank lines are supplied; older output is omitted. `mesa decide` also writes a receipt now, with every answer and its probabilities.
