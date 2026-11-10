---
type: added
---

Plan work as tasks with dependencies: `mesa tasks create "<spec>" --graph <name> --deps <id,id>` records a task, ready when what it waits on has succeeded, and `mesa tasks --ready` and `mesa tasks show <id>` say what can start and what holds the rest.
