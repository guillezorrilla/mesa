---
type: changed
---

A large `node_modules` now carries into a new worktree: an APFS clone takes almost no disk, so it may carry up to 250,000 entries, while a plain copy keeps the 2 GiB and 50,000-entry limit.
