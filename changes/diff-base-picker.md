---
type: added
---

Pick what a session's Diff compares with: the base beside the branch name is now a menu of the checkout's branches and the remote branches they track, and `mesa diff --base <ref>` does the same. A session whose agent moved to its own branch now compares with the project's default branch, not the branch its worktree started from.
