---
type: fixed
---

Going back to an earlier Mesa no longer breaks it: settings a newer Mesa wrote to your profile's config are ignored instead of stopping every command and hook, and `mesa doctor` names each one it ignores, which also catches a typo in the file.
