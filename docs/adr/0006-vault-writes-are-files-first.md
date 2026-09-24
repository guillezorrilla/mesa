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
