# ADR-0022: Lock files name their holder and recover from a dead one

Status: accepted
Date: 2026-10-05

## Context

Mesa serialises read-change-write updates of its state files across processes with lock files: a session record's `<id>.lock`, the vault's `.mesa/lock`, and the registry, inbox, usage, automations, prompts, PR events and output-log locks beside their files. Several Mesa processes write them at once: the app, the CLI, and the agent hooks Claude Code and Codex run.

The idempotency audit behind epic #630 found that a lock file held only a random token (`lib/lock-file.ts`), so nothing could tell whether its holder still ran. A hook that Claude Code kills at its timeout while it holds `<id>.lock` leaves every later write to that session failing with `locked`, and a killed vault writer blocks the whole vault, until a person deletes the file. `vault/vault-lock.ts` carried the same policy a second time, with its own async retry loop, and both said "no stale takeover (it races)".

## Decision

- `lib/lock-file.ts` is the one owner of lock files. It exports `withLockSync` and `withLock` (async, waiting with the injected `sleep`); `vault/vault-lock.ts` and every store call them and keep no retry loop of their own.
- A lock file is created whole (`createFileAtomic`) and holds its holder's `{pid, startedAt, token}`: the pid from the injected `processId`, the time from the injected clock. Only the holder whose token it holds removes it.
- When the create finds a lock, its holder's pid is checked with the injected `processAlive`. A live holder blocks, as before. A dead holder is taken over by renaming the new holder's record over the file (`writeFileAtomic`).
- Two contenders may find the same dead holder. Only the one that creates the claim file `<lock>.<dead token>` may replace it, and under the claim it reads the lock again and replaces it only if it still holds that dead token; the claim is removed straight after. So a contender that read the dead holder late finds the new holder's token and waits, and one owner remains.
- A lock file that does not read as a holder record (an older Mesa's bare token) is treated as live: it is never taken over, and the `locked` error still names the file to delete.

## Evidence

- `packages/core/src/lib/lock-file.test.ts`: a live holder blocks and keeps its file; a dead holder is taken over, the file records the new holder, and it is removed after; two contenders on one dead lock, the second reading the dead holder before the first takes over, enter one at a time.
- Removing the re-read under the claim, or the `processAlive` check, fails those tests.
- `packages/core/src/vault/notes.test.ts` keeps its held-lock test: a lock file that is not a holder record still times out as `locked`.

## Consequences

- Every store that locks takes `LockDeps` (`processId`, `processAlive`, `clock`), which `MesaDeps` already satisfies; tests pass `lockDeps()` from `@mesa/core/testing`.
- A crashed holder no longer needs a person; a pid reused by an unrelated live process keeps the lock blocked, the safe side.
- A contender killed while it holds a claim (one read and one rename) leaves that dead lock to be deleted by hand, as every lock was before.
- The lock stamps `startedAt` with the injected clock, one more read of it per lock taken.
