---
type: fixed
---

Worktree setup and teardown written as one command string, such as `["node --test test/"]`, now get a warning showing the split form, `[node, --test, test/]`, when you save them in `mesa config set`, a project's mesa.yaml or Settings, and their failure says why instead of a bare exit 127.
