---
type: fixed
---

A session's workers stay with it after a restart or a handoff: when a parent is resumed or hands off, its children sit under the new session on the Board and in `mesa sessions --tree`, their reports and questions go to it, and a worker that hands off keeps reporting to its own parent. `mesa show <id> --json` adds `parentNow`.
