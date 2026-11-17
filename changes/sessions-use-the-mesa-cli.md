---
type: changed
---

Lighter sessions: Claude Code, Codex and Antigravity sessions now read and save the vault and ask the Decision model through the mesa CLI and its skills, so each session no longer keeps two Mesa server processes of about 50 to 70 MB running. Run Update hooks once so Codex runs the mesa commands without asking and Antigravity drops Mesa's old server entries.
