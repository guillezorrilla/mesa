---
type: added
---

Checks for agents: set a project's check command (Settings > Project, or `mesa projects set <project> check "pnpm verify"`) and `mesa check` runs it, printing one line when it passes or only the errors and the log path when it fails, so long test and build output stays out of an agent's context. The session actions menu has Run check.
