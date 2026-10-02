# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's private vulnerability reporting: [open a draft advisory](https://github.com/guillezorrilla/mesa/security/advisories/new). Do not open a public issue, pull request or discussion for a security problem.

Include what is affected (the app, the `mesa` CLI, or the OAuth broker in `apps/broker`), the version, the steps to reproduce, and the impact you expect. You will get an answer within a week. A fix ships in a release, and the advisory is published once users can update.

## Supported versions

Only the latest release gets security fixes.

## Scope

Mesa runs on your Mac and keeps its data under `~/.mesa/` and in your Obsidian vault; the OAuth broker only exchanges sign-in codes for tokens and stores nothing (see [ADR-0014](docs/adr/0014-oauth-broker-and-keychain-tokens.md)). Reports about the agents Mesa launches (Claude Code, Codex, Antigravity) belong to their vendors.
