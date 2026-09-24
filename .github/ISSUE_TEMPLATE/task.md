---
name: Task
about: A half-day, one-PR unit of work with observable acceptance criteria
title: "area: imperative title under 70 chars"
labels: needs-triage
---

## Goal

One sentence: what exists after merge.

## Context

Two to four sentences. Link `CONTEXT.md` terms and ADRs in `docs/adr/`.

## Acceptance criteria

Every item observable: a command and its expected output, a file with a given shape, a passing test by path, or a screen with named elements.

- [ ]
- [ ]

## Test plan

Exact commands in order and what to see. For app issues: the screen to open and what must be visible.

1.
2.

## Out of scope

One to three lines.

## Depends on

Issue numbers, or none.

## Size

S (under 2 agent hours) or M (under 4).

## Review

Claude runs `/code-review` against this issue before merge; the Spec axis checks every acceptance criterion.
