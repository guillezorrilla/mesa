---
type: added
---

Start planned tasks with workers: `mesa worker <project> --task <id>` starts a ready task, and the worker's `done` or `failed` report settles it, so the tasks waiting on it become ready on their own. A worker that ends without a report, or three failed starts, fail the task; `mesa tasks retry` and `mesa tasks cancel` manage the rest.
