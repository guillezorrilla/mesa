---
type: changed
---

Faster worktrees that carry ignored files: a new worktree now copies the files and folders you list, such as `.env` or `node_modules`, as APFS clones that take almost no disk, and stops with a warning instead of copying more than 2 GiB or 50,000 entries. The setting is now `worktrees.carry`, in Settings > Git & Worktrees; the old `carryIgnoredDirectories` still works.
