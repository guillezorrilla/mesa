---
name: mesa
description: Drives Mesa, which runs many agent sessions across projects. Use when starting a session (with a goal or its own branch), messaging another session or replying to one, starting a child session, queueing work after a session, adopting a session started outside Mesa, handing off, or checking what other sessions are doing.
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

Check state before you act: `waiting-permission` or `waiting-question` means a person must answer that session, and Mesa refuses a prompt from you into it.

```sh
mesa sessions --tree            # every session, children under their parent, most urgent first
mesa show b2c3d4e5 --json       # one session's record, and whether it is alive
```

Adopt a Claude Code session started outside Mesa, so it can be messaged and resumed:

```sh
mesa adopt 36c173f2-803e-4845-bd97-a032b37c6d6d --project lantern-cove
```

## Everything else

`mesa help --agent` prints every command with its arguments, flags, and an example. Read it before a command this skill does not show, rather than guessing flags.
