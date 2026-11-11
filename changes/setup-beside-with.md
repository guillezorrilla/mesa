---
type: changed
---

Parallel worktree setup for every project of a session: with `setupWhile: parallel`, each project a session adds with `--with` runs its setup in its own Setup session beside the agent, opened in that project's worktree, instead of holding up the start.
