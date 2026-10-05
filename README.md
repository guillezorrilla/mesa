<p align="center">
  <img src="docs/assets/mesa-mark.png" width="128" height="128" alt="The Mesa mark">
</p>

<h1 align="center">Mesa</h1>

<p align="center">
  <strong>The vendor-neutral workspace for AI coding agents.</strong><br>
  Run Claude Code, Codex and Gemini side by side, keep their context, and never get locked in.
</p>

<p align="center">
  <a href="https://github.com/guillezorrilla/mesa/releases/latest"><strong>Download for macOS</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="#quick-start">Quick start</a>
  &nbsp;&middot;&nbsp;
  <a href="#features">Features</a>
</p>

<p align="center">
  <a href="https://github.com/guillezorrilla/mesa/actions/workflows/ci.yml"><img src="https://github.com/guillezorrilla/mesa/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/guillezorrilla/mesa/releases/latest"><img src="https://img.shields.io/github/v/release/guillezorrilla/mesa?label=release" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/macOS-14%2B-lightgrey?logo=apple" alt="macOS 14 or later">
</p>

<p align="center">
  <img src="docs/assets/board.png" alt="Mesa with sessions from three projects in the sidebar and two Claude Code sessions side by side in the terminal grid">
</p>

## Why Mesa

One agent in one terminal is easy. Six agents across four repositories is not: you lose track of which one is waiting for you, which one finished, and what each one decided last week. And every vendor wants you inside their own app.

Mesa is the layer above the agents: an agentic OS for your Mac, sometimes called an agentic development environment or a multi-agent orchestrator. It is a Mac app and a `mesa` CLI for engineers who already work with AI coding agents and want to run several at once.

- **Use every agent, depend on none.** Claude Code, Codex and Gemini (through Antigravity CLI) run as their own unchanged terminal apps, signed in with your own subscriptions. Mesa needs no API keys and has no account. Switch tools whenever a better one ships.
- **Run many sessions at once.** Start sessions across all your projects, each in its own Git worktree or branch if you want, and see them all on one Board. Mesa tells you which ones are working, finished, or waiting for an answer.
- **Keep context when you switch tools.** Hand a session's work to another agent with its goal and a handoff note (`mesa handoff <id> --agent codex`). Every agent reads and writes the same memory, so the next session, in any tool, starts where the last one stopped.
- **Own your memory.** What your agents learn lives in an Obsidian vault of plain Markdown on your Mac: project notes, decisions, session summaries. No vendor's cloud holds it, and it outlives any tool.
- **Proven before it ships.** A feature meant to make agents work better, like carrying what one session learned into the next, ships only if it beats plain Claude Code or Codex on the same tasks in a paired test: more tasks solved, at no more than 25% extra cost or time per solved task. Anything that cannot clear that bar stays out, so Mesa never slows your agents down for nothing. It matters because knowledge that sits in notes is not enough: in an [earlier pilot](docs/spikes/decision-assistance-feasibility.md#paired-pilot-does-advice-make-a-coding-session-smarter-or-faster) on six invented tasks, agents never opened the note holding a project's convention (0 of 12 runs passed), and with the right note handed to them at start, 10 of 12 passed.

## Features

- **One Board for every session.** Sessions from all your projects in one sidebar, grouped by project, with what each one is doing. Open one for its live terminal, or tile several in a grid. Shift-click or Cmd-click several sessions and archive them together from a right-click menu, or select with the keyboard: Shift+Arrow for a range, Cmd+Enter to toggle.
- **Bring the sessions you already have.** Mesa finds the Claude Code and Codex conversations of the last 30 days on your Mac, with the folders they ran in and the names you gave them. On first run it offers to add those projects and adopt their conversations in one step, so each one is a session you can resume. A session still running outside Mesa in a registered project can be adopted from the same dialog. Later, **Add project > Find from sessions** or `mesa discover` does the same.
- **One session across several repositories.** Work that spans an API and its web client, or a library and the app using it, runs as one session: `mesa open api --with web` gives every repository a worktree on the same branch and lets the agent read and change them all, Codex included. Queue, fork and remove act on every worktree together, and nothing is removed while any of them has unsaved work or submodules (unless `--force`), a locked worktree, or, when deleting the branch, a branch checked out elsewhere. Each additional repository also shows the session on its Overview, marked "from" the primary one.
- **Every agent, the same controls.** Start Claude Code, Codex or Antigravity CLI in a project, a new worktree or a branch. Swap the agent of a fresh session, queue a session to start after another ends, and hand work to a successor, in the same agent or another, before its context fills.
- **Shared memory in your vault.** Each profile owns an Obsidian vault: project hubs, notes, decisions, session summaries and a project map. Every agent reaches it through the same `mesa-vault` tools, and Obsidian opens it as is.
- **Guardrails you can check.** Prompts sent into a session and other outside actions pass a guardrail that can allow, ask or block, and each block or override is saved as a Receipt in your vault with the evidence behind it.
- **Light on your context.** Mesa adds a few hundred tokens to a session: a short note, three skills and the vault tools. The rest of the window stays for your work.
- **Your project knowledge, imported.** Connect Atlassian and Notion once, then pick the Jira issues, Confluence pages and Notion pages to import, or paste any public link. Each import lands in the vault, and can start a session.
- **Automations.** Per project, run a skill, start a session, message one, or refresh imported knowledge on a schedule, when a file changes, or when a session reaches a state, asking you first when you want it to.
- **A CLI for everything.** Every screen is backed by a `mesa` command with `--json`, so scripts and agents can drive Mesa too. Bulk commands (archive, `stop` and `rm --descendants`, `discover adopt`) report every item and exit 2 when any failed.

<table>
  <tr>
    <td width="33%"><img src="docs/assets/session.png" alt="A Claude Code session in Mesa showing its diff and summary"></td>
    <td width="33%"><img src="docs/assets/vault.png" alt="The Vault screen with a decision note and its confidence"></td>
    <td width="33%"><img src="docs/assets/map.png" alt="The map of projects and their sessions"></td>
  </tr>
  <tr>
    <td align="center">A session's live terminal</td>
    <td align="center">The vault, with a saved decision</td>
    <td align="center">The map of projects and sessions</td>
  </tr>
</table>

## Install

**Download** the DMG from the [latest release](https://github.com/guillezorrilla/mesa/releases/latest), open it, and drag Mesa to Applications. On first launch, the Set up screen creates your profile and vault and checks tmux and the agents.

The `mesa` command ships inside the app. To use it from a terminal, link it onto your PATH:

```sh
mkdir -p ~/.local/bin && ln -s /Applications/Mesa.app/Contents/MacOS/mesa ~/.local/bin/mesa
```

**Requirements:**

- macOS 14 or later.
- [tmux](https://github.com/tmux/tmux): `brew install tmux`.
- At least one coding agent, signed in with its own subscription: [Claude Code](https://docs.claude.com/en/docs/claude-code), [Codex](https://github.com/openai/codex), or Antigravity CLI for Gemini. Mesa needs no API keys and has no account of its own.
- [Obsidian](https://obsidian.md) is optional: the vault is plain Markdown, and Obsidian is only needed to open it there.

## Quick start

1. **First run.** Open Mesa. The Set up screen asks for a vault folder, creates your profile, and checks tmux and your agents. A short tour follows, after the offer in step 2 if there is one; you can leave it and resume it later.
2. **Add your projects.** If you already use Claude Code or Codex, Mesa offers after Set up to find your recent conversations: tick the folders to add, and their conversations become sessions you can resume, under their own names, and then the tour starts. Otherwise, in Projects, choose **Add project** and pick a Git repository, or **Import workspace** to find every repository under a folder.
3. **Start a session.** Press **+** beside the project. A session starts at once with the project's agent (Claude Code unless you chose another) and opens in its own terminal. The sidebar shows its state: working, waiting for an answer, idle, or queued.
4. **Use the CLI.** Everything above works from a terminal too:

```sh
mesa --help                                  # every command
mesa doctor                                  # check tmux, the agents, Obsidian, and the hooks
mesa hooks install                           # let Mesa follow each agent's state
mesa register ~/code/my-app --create         # add a project
mesa open my-app --goal "Fix the flaky login test"
mesa open my-api --with my-web --worktree    # one session in two repositories, one branch
mesa discover                                # recent Claude Code and Codex conversations on this Mac
mesa sessions                                # every session, highest attention first
mesa attach <session>                        # its terminal, right here
```

## How it works

`packages/core` holds all of Mesa's logic. `packages/cli` is the `mesa` command on top of it, and `apps/desktop` is a [Tauri 2](https://tauri.app) app whose every action runs that same CLI. Each session is a tmux window on the profile's own tmux server, so sessions keep running when the app closes and `mesa attach` reaches them from any terminal. The agents' hooks report each session's state back to Mesa. A profile (`~/.mesa/<profile>/`) holds the settings, the registered projects and the session records; its vault holds what should be remembered.

The terms Mesa uses are defined in [CONTEXT.md](CONTEXT.md). The decisions behind the design, with their evidence, are in [docs/adr/](docs/adr/).

## Privacy

- **Everything stays on your Mac:** your profile, session records and logs, Receipts, and the vault. Mesa has no server for any of them, no account, and no analytics.
- **The agents run as you,** with your own Claude Code, Codex or Antigravity sign-in. Mesa never handles those credentials.
- **Connecting Atlassian or Notion** goes through a small OAuth broker, a Cloudflare Worker ([ADR-0014](docs/adr/0014-oauth-broker-and-keychain-tokens.md)), because those vendors need a client secret that a desktop app cannot keep. The broker sees the sign-in code and the tokens as it passes them back to your Mac; it stores nothing and logs nothing. It never sees your pages or issues: Mesa calls the vendor's API directly from your Mac. Tokens are kept in the macOS Keychain, never in files. You can run your own broker and point Mesa at it with `MESA_BROKER_URL` (see ADR-0014).

## Building from source

Requires Node 24, pnpm 11, Rust stable, and tmux.

```sh
pnpm install
pnpm dev          # build core and the CLI, watch them, and launch the app
pnpm verify       # lint, typecheck, test, build: the gate every change passes
```

`pnpm dev` hot-reloads React and CSS edits. Core and CLI edits rebuild automatically and apply on the app's next action (reload or reopen a view to rerun its read). Rust edits rebuild and restart the app. Stop everything with Ctrl-C. Native notifications need a bundled `.app`, so they are off in `pnpm dev`. Use `MESA_PROFILE=<name> pnpm dev` to run against another profile. `pnpm dev:cli` runs only the core and CLI watcher, and `pnpm dev:desktop` only the app.

To use your checkout's CLI as `mesa`:

```sh
pnpm build
pnpm dev:link     # writes a shim at ~/.local/bin/mesa
mesa --version
```

The shim runs this checkout's `packages/cli/dist/mesa.js` with the node you ran it with, so `~/.local/bin` must be on your PATH. Run it again if you move the checkout or switch node.

## Contributing

Bug reports and ideas are welcome as [issues](https://github.com/guillezorrilla/mesa/issues). Pull requests from outside are not accepted for now. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Please report vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes, not in a public issue.

## License

[MIT](LICENSE)
