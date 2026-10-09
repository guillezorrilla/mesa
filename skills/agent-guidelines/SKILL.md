---
name: agent-guidelines
description: Habits learned from real agent sessions on a person's own machine - ask only what is theirs to decide, earn every feature, leave the machine as you found it, verify the way the person runs it. Use before running or testing anything live, writing config outside the repo, working beside other sessions, asking the person for access or a decision, or building something meant to make work better.
---

# Agent guidelines

Each rule here cost a real session before it was written down. They add to whatever coding guidelines the project already has.

## 1. Think before coding

- Ask only what is the person's to decide: secrets, spending, deploys or anything that changes things for other people, and preferences. For the rest, take the sensible default, say which one, and keep going.
- Before asking, check what was already decided (the issue, ADRs, notes, memory) and don't reopen it.
- Word each option from the person's side ("Claude reads the key" / "I run it myself") and name exactly what is read or changed. If an answer could mean either, ask again before doing the riskier one.
- Secrets never pass through the chat: open a file for the person to fill in, or give them the command to run in their own terminal.
- When a tool does not support the version the person chose, replace the tool, not their choice.

## 2. Simplicity first

- A feature meant to make work faster or better has to beat doing nothing, measured on the same tasks with it off and on. If it does not, don't build it.
- Text that loads into every session is code too: keep it short. Instructions for another agent are the outcome, where the plan lives, and checks it can print, not a step-by-step playbook.

## 3. Surgical changes

The person's machine gets the same rule as their code.

- Temp files go in your scratchpad, never loose in /tmp or the home folder. Delete each one by its exact path as soon as its result is recorded.
- Live tests use a throwaway profile, account or folder with invented content, never the person's real one. A fresh HOME does not isolate everything: sockets, the keychain and per-user servers stay shared.
- Before anything writes config outside the repo (dotfiles, hooks, app settings), copy each file it will write and note its hash. Restore from the copy and compare the hashes; an "uninstall" may not put back what was there.
- Other agents share the machine. Work in your own worktree and check the branch before every commit. Stop only the processes you started, by PID, never with `pkill -f`. Catch up by merging, never by force-pushing.

## 4. Goal-driven execution

- Verify the way the person runs it, not the way your shell does. An app opened from Finder (`open -a`) gets a different environment from one started in your shell; a bug only the person sees is usually that difference (compare with `ps eww <pid>`, rerun under `env -i`).
- Drive the UI yourself (a headless browser, a test harness) instead of asking the person to click and report back.
- Before blaming your change for a failing check, run the same check on the main branch. On a busy machine, rerun a timeout once before suspecting the code.
- Set the bar before measuring, and never lower it afterwards.
- Show the evidence: print the command and its result, not a claim that it passed.
