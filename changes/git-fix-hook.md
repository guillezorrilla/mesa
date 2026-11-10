---
type: added
---

Fix a failed pre-commit hook with an agent: when a commit's pre-commit hook fails, the Git tab offers Fix with AI, which hands the hook's output to the session working in that checkout, or starts one, to fix and stage it. `mesa git fix` does the same.
