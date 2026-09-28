# Spike: General sessions and plain terminals

Issue: #265. Date: 2026-09-27. Inspected the reference app's native New session control and a disposable General launch, then removed that test session. No prompt was submitted and its home-folder trust prompt was not accepted.

## Observed

- the reference app's global New session menu has recent projects, an Open terminal action, and a separate General Session entry labeled "No project context". Selecting General created a coding-agent session under a General group in Sessions, with the terminal as the selected main pane. Its native Claude Code process started in the user's home folder and showed that folder's trust prompt. The provider was not silently trusted.
- The menu's Open terminal action from a selected project created a plain shell session under that project. Closing that test terminal used a terminal-specific confirmation. The disposable General and terminal sessions were removed; the preexisting the reference app session remained.
- Mesa already has project-owned plain terminal sessions and Main/Worktree/Terminal choices on the Project overview. Its record and launch path currently require a registered project, so using a pretend registry entry for General would incorrectly give it project settings and could mutate the home folder with project skill links.

## Decision

A General session is profile-owned, not project-owned. Its record uses `project: __mesa_general__`, a reserved value outside project slugs, and an explicit absolute `cwd` equal to that profile's home path at launch. Its tmux session is a profile-local General group; it uses the profile default agent unless `--agent` is given. It has no `mesa.yaml`, worktree, project skill synchronization, project priority, or project link. The provider's own trust and permission prompts remain native. General can launch an agent or a plain terminal; a terminal has no coding-agent identity. The CLI entry is `mesa open --general` with an optional `--terminal`, and the app's global New session control offers General separately from registered projects.

A project session continues to require a real registered project and folder. Operations that require project configuration, a project skill, or a Git worktree explicitly refuse General until a meaningful General-specific behavior is designed. Session-level operations such as select, attach, send, stop, archive, and remove keep working by session ID. This is the smallest model that preserves ownership without inventing a project or agent.

## Qualification limits

Only the the reference app General start, native trust prompt, grouping, selected terminal, and project terminal start were inspected. General headless skills, cross-project handoff, queues, worktrees, history import, and provider-specific background/plan modes are not qualified by this spike.
