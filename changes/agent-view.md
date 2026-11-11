---
type: changed
---

Inside a session, `mesa sessions --json`, `mesa sessions <id> --children --json` and `mesa show <id> --json` print a compact view, a few fields a session, so an agent checking its workers rereads about 87% fewer bytes; `--full` prints every field. Outside a session, and in the app, nothing changes.
