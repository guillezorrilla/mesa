# Vault schema

Mesa laid out this vault. Agents that read or write it follow this file. Every note is a plain markdown file: write the file directly, since Obsidian only renders it and does not need to be open.

## Layout

- `raw/`: immutable inputs such as clippings, transcripts, and exports. Add new files; never edit, rename, or delete one.
- `wiki/`: knowledge agents write from `raw/` and from sessions. One topic per note; link related notes with `[[wikilinks]]`.
- `projects/`: one note per registered project, named after the project.
- `receipts/`: written by Mesa after every action, skill run, session, and decision, as markdown with YAML frontmatter (times as `YYYY-MM-DDTHH:mm`, which Obsidian shows as dates). Read them; never write or edit one.
- `daily/`: one note per day.
- `index.md`: a catalog of the notes in `wiki/` and `projects/`, one line each with a link and a one-line summary. Update it when you add, rename, or remove a note.
- `log.md`: append-only history, one line per event: `- <ISO time> <what happened>`, ending with `[[receipts/...|receipt]]` when there is a receipt. Add lines at the end; never edit or remove a line.
- `.obsidian/`: Obsidian's own settings. Never read or change it.
