---
type: changed
---

Claude Code no longer waits on Mesa after each tool call: the hooks that only log, such as the one after every tool, now run in the background. Run `mesa hooks install`, or Update on the hooks card, to get them.
