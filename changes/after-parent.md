---
type: fixed
---

A session an agent queues with `mesa open --after` is now that agent's own child: it gets the worker brief and reports back to it, not to the session it waited on, which is over by then.
