# Changelog

Each version's changes, newest first, in the [Keep a Changelog](https://keepachangelog.com/) style: Added, Changed and Fixed. Each user-visible pull request adds a change file under [changes/](changes/README.md), and `pnpm release:version` collects them into the version's section, which the release publishes as its notes and Mesa shows in its Notifications menu ([docs/release.md](docs/release.md)). To reword a note, edit its change file, not the bump pull request. Sections up to 0.2.11 were written from pull request titles and stay as they were.

## 0.3.9 - 2026-10-26

### Added

- Unread sessions: a session that finishes while you are not looking at it turns green with a bold title in the Sessions tab, and a banner with a sound tells you, until you open it. Mark any session unread to come back to it later from its menu, with Cmd+Shift+U, or with `mesa unread`. (#859)

### Changed

- The Reviews list keeps itself current: it reads your pull requests again every 15 minutes, and when you come back to Mesa after two minutes away, so there is no need to press refresh. (#859)

### Fixed

- Sessions a shutdown or restart closed now come back on their own when you open Mesa, instead of waiting in Recoverable, and Recoverable says Restoring... until they are back. (#859)

## 0.3.8 - 2026-10-22

### Added

- Sessions come back after a restart: when Mesa opens, the sessions a reboot closed reopen on their own with their names, and the Recoverable heading has Restore all for the rest, also `mesa resume --all`. (#853)

## 0.3.7 - 2026-10-16

### Added

- Session order in each project: drag a session card up or down within its project in the Sessions tab, or press Option+Up or Option+Down on it, and Mesa keeps that order after a restart. (#849)

## 0.3.6 - 2026-10-15

### Added

- Archived sessions in the app: the Sessions tab has an Archived section at the bottom, with its count, listing each archived session by title, project and when it was archived. Unarchive brings a session back live in its project, resumed, and Delete permanently removes it; archiving a session shows a toast with Undo, which does the same as Unarchive. `mesa sessions --archived` lists them, and `mesa unarchive --resume` resumes one. (#846)

### Changed

- Vault capture saves a session's decisions as it goes, at the end of a turn once 20 minutes and 10 messages have passed since the last capture, so archiving or deleting a session is instant and never waits on a capture. (#845)

## 0.3.5 - 2026-10-15

### Fixed

- PR reviews on Bitbucket work with the new ssh host: a project whose remote is `git@ssh.bitbucket.org:...`, the address Bitbucket asks every ssh remote to use from November 12, 2026, is now found as a Bitbucket project, so review drafts post again. (#841)

## 0.3.4 - 2026-10-15

### Added

- Mesa counts installs anonymously: once a day it sends a random install ID with its version and update channel, and nothing about your work or how you use it. Turn it off in Settings > General > Updates or with `mesa installs off`, which also erases it. (#839)

### Fixed

- Impact reads true for vault notes: a session gets each note's advice once, a note brought in again is one Moment, and an agent reading the note any way counts as opening it. A Moment still waiting on its outcome shows nothing, and Not right appears when you hover or focus a row. (#835)
- Re-reviewing a PR whose author pushed since your finished review starts the next round on the new head, instead of reopening the old review session on the old code. The finished session is stopped; a review that is still working, or one already on the newest head, is opened as before. (#832)
- A PR in the Reviews list says Reviewing only while its review agent is working or asking you something, so a finished review whose session stays open shows Updated again when the author pushes or replies. The PR page's "running" follows the same rule. (#830)
- Dropping a file on a session's terminal types its path again: in 0.3.3 the drop never reached the terminal, so nothing happened. (#831)
- Cost shows again for Claude Code usage routed globally, which it had marked n/a since Claude Code began reporting `global` inference, and Claude Haiku 5.5 has its list price. Usage days, Today and cost alerts now follow your local calendar day, so an evening session no longer lands on tomorrow. (#833)

## 0.3.3 - 2026-10-14

### Added

- Drop files on a session's terminal: dragging a screenshot or any file from Finder onto it types its path, and Claude Code attaches an image as it does in a terminal app. (#827)

### Fixed

- A session whose agent moves into a worktree mid-conversation now follows it: the board, the Diff panel and resuming use that worktree, instead of the folder the session started in. (#826)
- The Diff panel names the branch its changes come from as soon as it opens, the board follows a session into or out of a worktree while it works instead of after its turn, and a session that leaves the worktree it entered goes back to its own folder. (#828)

## 0.3.2 - 2026-10-14

### Added

- Pick what a session's Diff compares with: the base beside the branch name is now a menu of the checkout's remote and local branches, and `mesa diff --base <ref>` does the same. A session whose agent moved to its own branch now compares with the project's default branch, not the branch its worktree started from. (#824)

### Changed

- A review session now just runs /code-review on the pull request, the same review you get by asking for one, and adds what it finds as draft comments only you can see (or posts them with Post now). Inside a session, `mesa prs draft`, `publish` and `verdict` take the PR number alone. (#824)

## 0.3.1 - 2026-10-14

### Added

- Diffs in a pull request's Files tab: opening it lists the changed files and shows each one's diff, inline or side by side, as the session changes panel does, and `mesa prs diff` prints the same patch. (#822)

### Changed

- Following a board, list, repo or view now shows everyone's tickets at first: Only mine starts off, so turn it on to see just the tickets assigned to you. (#822)
- Searching for a Jira board or saved filter to follow now searches as you type, a moment after you pause, instead of waiting for Enter. (#822)
- Your comments on a pull request read as conversations: each thread is a card with its file and line, your comment and the latest reply on one rail, and its state as a colored pill and edge. (#822)
- Project names in the Reviews list stand out like they do in the Sessions list: each one has its folder in the project's color and reads in full contrast. (#822)
- Each session keeps its side panel: open Diff, Replies or Browser on one session, switch to another, and when you come back the panel is still open as you left it, on the same file and scroll. (#822)
- Assign to me is a check beside a ticket's start buttons, always in view, instead of only under Options; it keeps the project's choice for the next ticket as before. (#822)

### Fixed

- A project's configured worktree base now decides what its diff and recycle compare against, even when the clone's remembered default branch on origin is out of date. (#822)
- A new session gets its name from your first message right away, while its first turn is still working, instead of only after that turn ends. (#822)

## 0.3.0 - 2026-10-14

### Added

- Add your vault to Obsidian from Mesa: when Obsidian does not know Mesa's vault yet, Open in Obsidian shows a short guide that copies the vault's path and opens Obsidian's vault manager, then opens the note once you are done. (#810)
- Not right on Impact: mark any moment Mesa got wrong, from its row or with `mesa impact mark`, and it drops out of the summary; Impact also says when the agent opened a note Mesa brought into its prompt, or never did. (#804)
- Impact shows what Mesa decided and kept for you and what happened next: a one-sentence summary, then each session's moments (a question the rules missed, a vault note brought into a prompt, a risky command stopped, notes kept), who decided and how sure, and what the rules alone would have said. Open it from the title bar beside Cost and Help, a project's Impact tab, Mesa's part in session details, Search Mesa, or `mesa impact`; `mesa decisions log` lists every decision behind it. (#796)
- Send feedback from Mesa: Help > Send feedback, or `mesa feedback "<message>"`, sends your message privately to Mesa's maker with only your Mesa version and the screen you were on. (#815)
- Install Obsidian from Mesa: when Obsidian is missing, setup's vault step and Doctor offer an Install button that installs it with Homebrew, so a new Mac gets going without leaving the app. (#806)
- Pull request detail: open a PR from the Reviews tab to see in one sentence where it stands, your comments with the author's replies, your pending draft comments (discard any of them) and the changed files; `mesa prs draft` leaves a draft comment only you can see until you submit it on GitHub or Bitbucket. (#801)
- Safer review sessions and comment verdicts: a Claude review session is refused the direct `gh` and `twg` commands that approve, merge or post (its prompt forbids any other route), and a re-review marks each of your earlier comments as addressed, partly addressed or not addressed in Your comments. (#807)
- PR review sessions: Start review (or Re-review once the author updates) opens a session at the PR's head that leaves its findings as inline drafts only you can see, or posts them as comments when you pick Post now for that review; it never approves or requests changes. (#805)
- Reviews tab: see the GitHub and Bitbucket pull requests that need your review across every project, grouped by project or by status, with what changed since your last review; Mesa helps you install and sign in to gh or twg when a project needs it. (#797)
- Replies pane: the session's Review button is now Replies, and every code block Claude or Codex wrote in a reply shows with its own Copy button, so a drafted message or command is one click away; Comment on an open reply still sends passage feedback. (#777)
- Diff beside a session: the new Diff button next to Replies and Browser shows everything the session changed since it left its base branch, its commits, edits and new files together, with a file list you can walk with j and k and open in your editor. Drag its edge to make it wider or narrower. (#775)
- Sessions name themselves: a session you have not named gets a short name from what you asked it, such as fix-login-redirect, and one started from a ticket starts with the ticket's key, such as lc-12-tide-alarm. Each card also shows the branch its agent is working on, including a worktree the agent made itself. (#773)

### Changed

- Starting a session from a ticket now switches to that session as soon as the start finishes, with no Open session click. (#802)

### Fixed

- PR reviews: a Bitbucket PR you only commented on now moves to Updated when the author answers, review sessions call the same Mesa that started them, reviews are shorter and a re-review reads only what changed since, and the Reviews tab shows relative ages, keeps the author's news beside your drafts, and asks before discarding a draft. (#811)
- Pull requests on narrow windows: the review and Submit buttons move under the summary instead of being cut off, a pull request fills the main area, and the project tabs scroll sideways when they do not fit. The Mesa window now stops shrinking at 900 by 600. (#818)
- Alerts you can close for good: a long alert keeps its close button in view, a failure that repeats on every refresh alerts once, and a session file Mesa cannot read is listed once in Doctor instead of alerting. The notification list no longer shows "Session turn finished", whose macOS notification the Turn finished setting still controls. (#817)

## 0.2.15 - 2026-10-13

### Changed

- Projects stand out in the Sessions tab: projects with sessions come first, show their name in bold with a count, keep their header in view while you scroll, and carry their own color on the folder and on a rail beside their session cards. (#769)

### Fixed

- Delete permanently now saves the session's decisions to the vault: its Vault capture runs in the background, so the session still disappears at once. Agents also save your corrections to how they work, such as which tool to use or a convention, as soon as you give them. (#772)
- The Tickets list groups tickets by their own status, so Ready tickets sit apart from In Progress ones instead of all showing under In progress; Linear and ClickUp lists group by their status names too, and ClickUp's status icons wear its status colors. (#768)

## 0.2.14 - 2026-10-12

### Added

- Resizable sidebar: drag the workspace sidebar's right edge, or focus it and use the arrow keys, to make it between 200 and 480 pixels wide. Double-click the edge to reset it, and Mesa remembers the width across launches. (#763)

### Changed

- A loading screen at launch: Mesa shows its mark and a spinner on the app background until the first view is ready, then opens straight on onboarding, your first live session or the Board, with no empty Board or white flash in between. (#764)

### Fixed

- Follow a repo fits the window and is easier to narrow down: labels and milestones are picked from searchable lists, picked labels show with a remove mark, and Follow stays in view however many there are. Links to GitHub and other sites, such as Give Mesa access on GitHub, now open in your default browser. (#760)
- Session card buttons stay readable on hover: a card's title now stops short of its hover buttons instead of running under them. (#761)

## 0.2.13 - 2026-10-12

### Added

- ClickUp in Connections and the Context tab: connect ClickUp once, then browse its Workspaces, spaces, folders, lists and Docs in the Picker, or paste a task or Doc page link, to import ClickUp tasks (with their descriptions and comments) and Doc pages into a project's vault. (#749)
- ClickUp in the Tickets tab: a project can track its work in ClickUp, following a List, a whole Folder or Space, or a saved view, then open any task or subtask, assign it to yourself, and start a session from it. (#753)
- GitHub Issues in the Tickets tab: connect GitHub, follow a repo narrowed by labels and milestone, open an issue to read its comments, assign yourself, and start a session from it, as with Jira. A project with no tracker yet asks where it tracks work, and the gear changes it while keeping the old views for when you switch back. (#752)
- Linear in Connections and the Context tab: connect Linear once, then browse its teams, projects, issues and documents in the Picker, or paste an issue, project or document link, to import Linear issues (with their descriptions and comments), projects and documents into a project's vault. (#750)
- Linear in the Tickets tab: follow a team's current or next cycle, a project, or one of your saved views, open an issue to see its priority, cycle, estimate and comments, assign yourself, and start a session from it, as with Jira. A Linear connection made before this asks you to reconnect once the first time you assign an issue. (#754)

### Fixed

- Starting a session or importing by a ticket key: `mesa open --from` and `mesa import` take the ticket ids `mesa tickets` lists (linear:ENG-123, clickup:DOCK-112), and a bare key such as ENG-123 reads as Linear or ClickUp when Jira is not connected, instead of asking you to connect Atlassian. (#755)
- Tickets tab without an Atlassian sign-in: a project that follows Jira views now lists them with one Connect Atlassian banner, instead of staying on "Reading Jira...". (#751)

## 0.2.12 - 2026-10-11

### Added

- What's new in each version: after Mesa updates, the Notifications menu has a notice for each version installed since the last one you saw, with a count of what is new, changed and fixed that expands to the notes. `mesa whats-new` prints them too. (#745)

## 0.2.11 - 2026-10-11

### Features

- **tickets**: Start goal shows its proof (each check, the commit and the push) in the conversation, where the goal's checker can see it, and says what it tried when Blocked; Investigate defines Confirmed for bugs, spikes and stories and no longer stops on a progress summary (#743)

## 0.2.10 - 2026-10-11

### Features

- **app**: fold the session composer when it loses focus, and align its options (#738)

### Fixes

- **tickets**: the Tickets tab keeps the selected ticket when you come back, an Options change holds for every ticket after it (saved as the project's default), and Write notes first is off by default (#740)
- **app**: keep the window's size and position across updates and relaunches (#739)

## 0.2.9 - 2026-10-11

### Features

- **tickets**: start a ticket session three ways: Start session, Investigate (proves the cause or answer before any fix), or Start goal (finishes the ticket on its branch and pushes it); Codex runs `/goal` too (#732)
- **tickets**: name a ticket view when following it and rename it in Manage views, pick the Jira fields every ticket panel shows (Components, a severity, any custom field), and keep each project's picked view when you come back (#733)

### Fixes

- **sources**: read Keychain items through osascript so token refreshes stop prompting (#731)

### Breaking changes

- **tickets**: `mesa import goal --until-done` and `mesa tickets defaults --until-done` are gone: use `--as goal`. A ticket prompt that starts with `/goal` no longer starts a goal; it is added as My rules (#732)

## 0.2.8 - 2026-10-10

### Features

- **tickets**: start a ticket session in one click, with clearer options and prompts written in place (#724)
- **tickets**: start ticket sessions as /goal, held to finishing the ticket (#722)

### Fixes

- **decisions**: point agents at the Decision model when its tool is not mounted (#729)
- **app**: switch profiles in the same app, one Dock icon (#726)

## 0.2.7 - 2026-10-09

### Features

- **vault**: make the project Vault tab's overview read cleanly (#719)
- **imports**: run Picker imports in the background with progress in the Context tab (#717)

## 0.2.6 - 2026-10-09

### Features

- **app**: terminal color palettes, presets and custom colors (#714)

## 0.2.5 - 2026-10-09

### Fixes

- **tickets**: offer Reconnect when Jira refuses the board list, and fit the tab to the window (#712)

## 0.2.4 - 2026-10-09

### Features

- **tickets**: name Jira in the Tickets tab's setup, and move Vault after Files (#707)

## 0.2.3 - 2026-10-09

### Features

- **skills**: ship agent-guidelines, on by default, with a Settings switch (#705)
- **vault**: re-capture a session's newer messages, capture background sessions, and build capture input in vault/capture (#704)
- **vault**: capture session decisions at session end, and nudge agents to ask the Decision model (#697)
- **sources**: redesign the Tickets tab around a ticket panel, and assign a ticket when a session starts from it (#698)
- **sources**: a Tickets tab that lists a project's followed Jira views and starts sessions from them (#694)

### Fixes

- **sessions**: a finished turn with background work reads idle, not working (#701)
- **app**: a session's background read of a replaced notice no longer toasts (#700)
- **app**: declutter the usage dialog and show priced costs instead of Unknown (#696)

## 0.2.2 - 2026-10-09

### Features

- **app**: create, switch and manage profiles from the app (#688)

### Fixes

- **notifications**: the Inbox keeps one notice per session, its newest, raises none when a subagent finishes, and marks a session's notice read when you open it (#690)
- **sessions**: a click in empty space puts the keyboard back in the open session (#689)

## 0.2.1 - 2026-10-08

### Fixes

- **sessions**: a session starts in a project whose untracked mesa.yaml went missing, writing a minimal one back instead of failing with "no mesa.yaml" (#684)
- **projects**: right-click a project in the sidebar for the same actions as its menu: rename, pin, hide, reorder, unregister (#684)
- **projects**: unregistering the project in view opens the nearest one in the sidebar instead of Sessions (#684)
- **sessions**: a collapsed Sessions folder expands when a new session appears in it (#684)
- **app**: Review > Responses shows two lines of each response and opens its review in place under it (#684)

## 0.2.0 - 2026-10-08

### Features

- **decisions**: smarter decisions with your own Jev (TypeSafe) or CLEF (Cloudflare Workers AI) key, kept in the Keychain. With no key, sessions run exactly as before (#669, #670)
- **sessions**: Claude Code and Codex get the most relevant project notes for each prompt, and can ask for a next step or check evidence through in-session tools (#672, #673)
- **decisions**: each automatic use is turned on only after paired workflows show it makes sessions finish more often or faster: prompt advice for Jev and CLEF, Board placement for CLEF (#671, #674, #681)
- **app**: Settings > Smarter decisions connects a model in a few clicks and shows how each use performed (#670, #674)
- **app**: prompt to update Mesa's hooks when they are out of date or a key needs them (#680)
- **search**: fuzzy palette ranking and a session switcher (#668)

### Fixes

- **core**: the browser entry reaches no Node built-in, so pnpm dev loads the app (#667)

### Other

- **readme**: the all-in-one workspace and the new decision models (#676)
- **app**, **sessions**, **core**: app, CLI and core structure reorganised by domain (#663, #664, #665, #666)

## 0.1.7 - 2026-10-06

### Features

- **app**: the terminal edits the line like macOS terminals: Cmd+Left/Right jump to its start or end, Cmd+Backspace deletes it, Option+Left/Right move by word (#661)
- **app**: Shift+Enter inserts a newline by default (#657)

### Fixes

- **app**: switching sessions puts the keyboard in the new session's terminal (#653)
- **app**: sidebar sessions stay in the order they were opened (#655)
- **app**: no beep on Cmd+C after a drag copies from the terminal (#659)

## 0.1.6 - 2026-10-06

### Features

- **sessions**: a session's state files recover from a crash: a lock left by a dead process is taken over, and a retried write keeps one receipt (#640, #642, #644)

### Fixes

- **sessions**: tmux windows, worktrees and file writes recover from a crash midway (#646)
- **sessions**: one resume per conversation, even when started twice (#645)
- **sessions**: a new session's terminal shows its own window (#635)
- **agents**: read Claude transcripts and settings from CLAUDE_CONFIG_DIR (#636)
- **usage**: agent labels and usage types come from core, the same in the CLI and the app (#600)

### Breaking changes

- **instructions**: agent instruction files moved from rules to instructions: `mesa rules` is now `mesa instructions list|read|write`, and the app's Rules tab is Instructions. `mesa rules` exits with a pointer to the new name (#601, #637)

### Other

- **release**: one update installer, through the app (#602)
- **core**: dependency injection cleanup: the command runner carries an injected environment, and modules take only what they use (#649, #650)

## 0.1.5 - 2026-10-05

### Features

- **app**: a new first run that goes from choosing a vault to a running session: pick an Obsidian vault or create one, install what sessions need, choose your projects, and start your first session (#588)
- **doctor**: install a missing tmux, Claude Code or Codex from the app with one click, through Homebrew (#587)

### Fixes

- **app**: show expected absences as empty states instead of error banners, and lay out the vault when the profile is created (#584)
- **app**: drop confirmation banners the screen already shows (#583)
- **sessions**: scroll a session's terminal one line per row of wheel travel (#579, #580)

## 0.1.4 - 2026-10-05

### Features

- **app**: fill the context ring on its own and open context use on click (#570)

### Fixes

- **vault**: describe the vault read tools as on-demand, not first (#574)
- **app**: focus the agent's terminal when a session opens or is selected (#573)
- **sessions**: show the name a session got in Claude Code instead of its id (#568)

## 0.1.3 - 2026-10-05

### Features

- **app**: sort projects by name by default, remember the sort, never reorder on select (#564)

### Fixes

- **sessions**: widen Find from sessions, one scroll, readable running session names (#565)
- **app**: drop Faro and decisions from the tour (#563)

### Other

- **docs**: say in the README that features ship only if they beat plain agents (#556)
- **spikes**: audit transcripts for knowledge lost between sessions (#557)

## 0.1.2 - 2026-10-05

### Features

- **app**: honest roles and keyboard multi-select in the Sessions tab (#512) (#550)
- **app**: explain or adopt running sessions discovery cannot tick (#510) (#549)
- **app**: show sessions where a project is additional on that project's views (#548)
- **app**: show first-run discovery before the tour (#546)
- **release**: write release notes and CHANGELOG from typed PR titles (#518)

### Fixes

- **sessions**: quality pass over P13 (#537) (#553)
- **sessions**: cut the bytes mesa discover reads, scan once per Add to Mesa run (#551)
- **sessions**: one partial-failure exit for bulk commands, adopt worktree conversations under their project (#547)
- **sessions**: start Codex --with sessions with the workspace-write sandbox (#515) (#544)
- **sessions**: check every repo for git blockers before rm across projects (#543)

### Performance

- **sessions**: read a Claude Code name from the last 1 MiB of its transcript (#513) (#542)

### Other

- **readme**: describe P13 multi-project and discovery changes (#552)
- **sessions**: move new-session record creation out of launch.ts (#545)
- **readme**: drop Faro, add discovery, multi-project sessions and bulk archive (#519)

## 0.1.1 - 2026-10-04

### Features

- **sessions**: list native projects and recent conversations machine-wide (#502)
- **sessions**: select several sidebar sessions and archive them together (#503)
- **sessions**: start one session across several projects with `mesa open --with` (#504)
- **sessions**: offer discovery on first run and adopt recent sessions in bulk (#505)
- **sessions**: queue, fork and remove sessions across several projects (#506)
- **sessions**: count additional projects in the board, pull requests, goals and search (#507)
- **app**: start a session from the empty composer without a first message (#493)

### Fixes

- **sessions**: refuse a `/goal` goal where the agent cannot run `/goal` (#501)

### Other

- **decisions**: decide with rules only by default, dropping the slower model adapter (#491)
- **sessions**: clean up the multi-project and discovery code (#516)
- **docs**: lead the README with what Mesa gives you (#483)
- **docs**: explain what Faro gives you and link its docs (#486)

## 0.1.0 - 2026-10-03

First stable release. See [Mesa 0.1.0](https://github.com/guillezorrilla/mesa/releases/tag/v0.1.0).
