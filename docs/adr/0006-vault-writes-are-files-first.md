# ADR-0006: Mesa writes the vault as files; the Obsidian CLI is optional

Status: accepted
Date: 2026-09-24

## Context

The proposal said to use the Obsidian CLI (1.12+) where useful. Research (docs/research/sources/obsidian.md) confirmed the CLI exists officially from Obsidian 1.12.7, is enabled by a settings toggle that symlinks /usr/local/bin/obsidian with admin rights, and requires the Obsidian app to be running; the bundle binary fails with "unable to find Obsidian" otherwise. It supports a format parameter (json, tsv, csv). Community reports say files created externally are not always picked up until a reload.

## Decision

- All vault writes (notes, receipts, log.md, daily notes, canvases, bases) go through packages/core writing markdown, .canvas, and .base files directly. This works with Obsidian closed, in CI, and in tests.
- The Obsidian CLI is an optional accelerator, used only for actions that need the running app: `mesa vault open`, search across the vault, plugin reload, and eval in the P1 spike. `mesa doctor` reports whether it is registered. Every CLI use has a file-based or URI-based fallback (`open obsidian://open?vault=...`).
- The P1 spike verifies whether externally created files appear live and records the result; if they do not, `mesa vault` triggers a reload through the CLI when the app is running.

## Evidence

obsidian.md/help/cli, obsidian.md/help/bases, jsoncanvas.org/spec/1.0, kepano/obsidian-skills, local bundle binary run, all accessed 2026-09-24.

## Consequences

- No hard dependency on the app being open or the CLI being enabled.
- JSON Canvas 1.0 and Bases (five view types: table, list, cards, kanban, map) are written by hand from the specs.

## Amendment 2026-09-25: the spike's findings

docs/spikes/obsidian-cli.md (issue #15, Obsidian 1.13.7, installer 1.12.7) replaces three assumptions above:

- Externally written files appear live. Notes and new folders written by `writeNote` were listed by the running app within 100 ms and searchable at once, three times each, with no reload. The reload fallback is dropped.
- The registered CLI does not launch Obsidian: with the app closed every command prints "The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again." and exits 1. An `obsidian://open` URI does launch it, so the URI is the default for `mesa vault open` and the fallback for `--cli`.
- CLI commands can write: `daily:read` creates an empty daily note at the vault root when none exists, because Obsidian's Daily notes plugin looks at the root and Mesa writes `daily/`. Mesa never runs the CLI's `daily:*` commands on a vault.

Unchanged: the vault is written as files, and `.obsidian/` stays Obsidian's (Obsidian creates it the first time it opens a vault). A vault is added to Obsidian's list only through the app ("Open folder as vault"); `obsidian://open?path=<folder>` on an unknown folder shows a "Vault not found" modal, so `mesa vault open` checks Obsidian's `obsidian.json` (read-only) first. The same alert appears for `vault=<unknown name>`, and while it is up the app answers no CLI call and refuses to quit.


## Amendment 2026-09-27: substantive note changes produce knowledge (#274)

The file writer remains the authority for vault notes. A completed skill run records a `vault-change` receipt only when its target note body changes, after the note write succeeds, under the vault lock. Repeated completion and an identical body from another run add no history. The receipt links the exact note; raw terminal output stays in the profile's local files. The shared note path guard rejects symlink paths that leave the vault.
