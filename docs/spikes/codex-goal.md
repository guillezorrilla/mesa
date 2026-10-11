# Codex /goal from its first prompt

Date: 2026-10-10. Codex CLI 0.162.1 on macOS.

## Question

Mesa starts Codex with the goal as its first prompt (`codex ... -- '<goal>'`). Does a goal that opens with `/goal` run Codex's goal command, or reach the model as plain text? Mesa refused `/goal` for every agent but Claude Code.

## What was run

`codex features list` shows `goals  stable  true`. In a throwaway git folder, the owner ran:

```
codex -- '/goal A file named done.txt exists here containing the word ok.'
```

## Outcome

Codex showed the goal as pursued ("Pursuing goal") and wrote `done.txt` containing `ok`. So `/goal` runs from the first prompt, and Mesa now allows it for Codex through the `goal` agent capability (`agents/names.ts`). Codex's developer-commands docs cap a goal objective at 4000 characters, the same cap Mesa checks for Claude Code (`sessions/start/goal.ts`).

Antigravity CLI 1.3.3 lists `/goal` in its slash menu, but `agy --prompt-interactive '/goal ...'` did not start a goal, so Mesa still refuses it there.
