---
type: fixed
---

Reviewing a pull request again after its author force-pushed works: the review worktree moves to the new head instead of reporting commits to push, and removing an older review round keeps the worktree the newer round now uses, and says so.
