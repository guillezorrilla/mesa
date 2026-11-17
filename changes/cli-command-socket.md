---
type: changed
---

Agent hooks and mesa commands run about four times lighter while the app is open: they hand their work to the app's helper process instead of loading all of Mesa each time, and still run on their own when the app is closed. `mesa phone serve` and the commands that wait (`mesa wait`, `run`, `check`, `sources connect`, `vault capture`, `import` and `import refresh`) always run as their own process.
