# Vault schema

Mesa laid out this vault. Agents that read or write it follow this file. Every note is a plain markdown file: write the file directly, since Obsidian only renders it and does not need to be open. Inside a Mesa session, save through the `mesa-vault` tools or `mesa vault save`, which keep the index, the log, and the history for you.

## Layout

- `raw/`: immutable inputs such as clippings, transcripts, and exports. Add new files; never edit, rename, or delete one.
- `projects/<name>.md`: the project hub, one per registered project, named after it, with short sections: Purpose, Status, Decisions, Links. Each is a few lines linking to the wiki notes that hold the detail. `mesa run project-brief` regenerates a hub and keeps only blocks between paired `<!-- keep -->` markers, so Status, Decisions, and Links sit inside them. `projects/<name>/` holds any further notes of that project.
- `wiki/`: knowledge written from `raw/` and from sessions, one topic per note, with `project: <name>` in the frontmatter when the note belongs to one project. Sessions save into:
  - `wiki/decisions/<YYYY-MM-DD>-<slug>.md`: a decision with its rationale, and Faro's probabilities and confidence when it has them.
  - `wiki/sessions/<id>.md`: a session's summary.
  - `wiki/notes/`: any other note: a fact, a finding, how something works.
- `receipts/`: written by Mesa only for what is worth keeping: a deliberate decision with its rationale, a material guardrail block or override, and a substantive change to a vault note. Routine session events, sends, reads, retries, and writes that change nothing have none. Each is markdown with YAML frontmatter (times as `YYYY-MM-DDTHH:mm`, which Obsidian shows as dates). Read them; never write or edit one.
- `daily/`: one note per day.
- `index.md`: a catalog of the notes in `wiki/` and `projects/`, one line each: `- [[wiki/notes/tide-sources]]: one-line summary`. Update it when you add, rename, or remove a note.
- `log.md`: append-only history, one line per kept change or `mesa log` entry: `- <ISO time> <what happened>`, ending with `[[receipts/...|receipt]]` when there is a receipt. Add lines at the end; never edit or remove a line.
- `.obsidian/`: Obsidian's own settings. Never read or change it.

## Notes

- Link related notes with `[[wikilinks]]`: a decision links its hub, a summary the decisions it made. `[[name]]` resolves by file name, `[[folder/name]]` by path.
- A note whose frontmatter says `locked: true` belongs to the person: read it, never change it.
- Record what a later reader acts on: decisions, summaries, and findings. A session opened, resumed, or stopped, a prompt sent, a status read, a retry, or a test run gets no note, log line, or receipt.
