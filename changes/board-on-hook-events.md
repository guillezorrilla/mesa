---
type: changed
---

The Session Board updates the moment an agent's state changes, and the app runs far fewer background checks: it looks when a hook event lands instead of every two seconds, with a slow check every 10 seconds (30 while the window is in the background) as a fallback.
