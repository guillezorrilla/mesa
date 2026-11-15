---
type: added
---

Structured view for Codex sessions: `mesa open --agent codex --view structured` (or Structured as the default in Settings) runs Codex through its app-server under Mesa, with its reply in `mesa chat` as it streams and a message sent mid-turn steering the turn, and the Terminal | Chat control (or `mesa sessions view`) switches it to Codex's own TUI on the same thread and back.
