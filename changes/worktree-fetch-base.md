---
type: changed
---

Faster session starts on a new branch with fetch on: Mesa now fetches only the branch's base, such as `origin/main`, instead of every remote, and reuses a fetch from the last 30 seconds. When the fetch fails, the session starts from the local copy with a warning instead of not starting.
