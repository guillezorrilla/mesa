# Changelog

Each version's changes, newest first, in the [Keep a Changelog](https://keepachangelog.com/) style: Added, Changed and Fixed. Each user-visible pull request adds a change file under [changes/](changes/README.md), and `pnpm release:version` collects them into the version's section, which the release publishes as its notes and Mesa shows in its Notifications menu ([docs/release.md](docs/release.md)). To reword a note, edit its change file, not the bump pull request. Sections up to 0.2.11 were written from pull request titles and stay as they were.

## 0.4.1 - 2026-11-13

### Added

- Review a session's work on your phone: Mesa's iPhone app opens a session's changes file by file with lines added and removed, pages through a large diff as you scroll, and sends a note on the lines you tap, or on a passage of a reply, to its agent through the guardrail. It also stages, commits (with a message you type or one an agent writes), pulls, pushes and switches branch, and browses, searches and previews the session's files. (#1092)
- A coordinator's crew on your phone: its session screen lists its workers with their state, branch and newest report, and its task graph with ready tasks first, and merges a worker's branch back, listing any conflicting files. Decision gates wait in Needs you and resolve from the phone, with the Decision model's advice and each option's probability beside the options. (#1091)
- Answer prompts from your phone: in Mesa's iPhone app, Needs you shows what each waiting session asks in one line, and its session screen shows the prompt as a card with the same options you have at the Mac, so you can allow a command or answer a question away from the desk; a prompt already answered at the Mac is refused as moved on. (#1090)
- Reply to a session from your phone: Mesa's iPhone app, coming next, gets a reply bar on each session with your saved prompts, a photo or screenshot, drafts that wait for you, and a menu to stop, resume, fork, hand off, rename or archive it. A reply to a working session waits on your Mac until its turn ends, and the guardrail checks every reply as it does `mesa send`. (#1093)

### Fixed

- A session's card lists only children you can open: Vault capture runs and children that have ended no longer appear as rows, selecting the card no longer tints its children's rows, and a child's row turns green while its reply is unread, as a card does. (#1097)

## 0.4.0 - 2026-11-12

### Added

- Answer a waiting session's prompt from Mesa: a session asking to run a command or make an edit, or asking a question, shows the prompt as a card with its options as buttons, and `mesa prompt` and `mesa answer` do the same from the command line.
- Pull requests on session cards: a session whose branch has a pull request shows its number on its card, coloured open, draft, merged or closed, and a click opens it in the browser.
- Session cards say what each session did: a card shows the lines its work added and removed after its branch, and its agent's last reply in one line, with the whole reply on hover. Compact cards hide both.
- Child reports: a session started from another now tells its parent by itself when it finishes a turn, waits on you, or ends, with its last reply, typed in once the parent is idle; `mesa reports` lists what is waiting, and Settings > Notifications turns it off.
- See a session's workers at a glance: a session with children has a Crew toggle beside Diff, listing each worker's state, newest report, branch and changed lines, with Send and Stop on each row. `mesa sessions <id> --children --json` lists the same.
- The Crew panel shows the tasks a session coordinates: each task's state, what it waits on, and its worker (click to open it), with Start on a ready task and the reason on a failed one. A session with tasks has a Crew toggle before it has any worker.
- Decision gates: an agent can put a choice only you may make on a planned task with `mesa gates create`, the task waits as blocked and shows in your Inbox, and once you pick an option with `mesa gates resolve` the agent that planned it gets your answer.
- Workers report their own outcome: a session started by another finishes with `mesa report done`, `failed` or `blocked`, and its parent gets that outcome and the files it names instead of reading it out of the last reply. The session's details show what it reported.
- Generate commit messages: the Git tab's Generate button, and `mesa git message`, have an agent write a commit message for what is staged, following a recipe each project can change in Settings > Projects.
- Discard changes in the Git tab: each changed file has Discard changes, on its row and its right-click menu, and Discard all throws away every change, both after a confirmation that lists the files and says untracked ones are deleted. `mesa git discard` does the same and needs `--yes`.
- Fix a failed pre-commit hook with an agent: when a commit's pre-commit hook fails, the Git tab offers Fix with AI, which hands the hook's output to the session working in that checkout, or starts one, to fix and stage it. `mesa git fix` does the same.
- Draft pull request text: Write PR text in the Git tab's Remote panel, and `mesa git pr-text`, have an agent write a pull request title and body for the branch, editable and ready to copy, from a recipe each project can change.
- Resolve conflicts with an agent: a checkout stopped in a merge, rebase or cherry-pick shows a banner in the Git tab, its conflicted files marked, and Resolve with AI hands them to the session working there, or starts one, to resolve them, run the tests and continue. `mesa git resolve` does the same.
- Keep the Mac awake: Settings > Sessions can stop the Mac from idle-sleeping while any agent is working, or always while Mesa is open, and the title bar shows a coffee cup while it does. `mesa awake` sets and reads it.
- Merge a worker back: `mesa merge <worker>`, or Merge into parent on the Crew panel, brings a worker's branch into its parent's checkout, and on a conflict stops cleanly and names the files.
- Checks for agents: set a project's check command (Settings > Project, or `mesa projects set <project> check "pnpm verify"`) and `mesa check` runs it, printing one line when it passes or only the errors and the log path when it fails, so long test and build output stays out of an agent's context. The session actions menu has Run check.
- `mesa wait` blocks until the sessions you name are idle, waiting on you, or over, so a script or headless run can wait for an agent without polling the board.
- `mesa worker <project> "<task>"` starts a worker in one command: a child of the session that runs it, in its own worktree, with the task as its goal and the worker brief. In the app, a session's actions offer New worker, which asks for the task.
- Send review notes to any agent: Send notes on a Session diff, and `mesa review notes send --to`, deliver the notes to another live session in the same checkout, its parent or children, or a new agent started there, and `c` starts a note on the focused diff line.
- Phone pairing: Settings > Phone and `mesa phone pair` show a QR that Mesa's iPhone app, coming next, scans to pair with this profile; what passes between them is sealed, so Mesa's broker cannot read it.
- Phone pushes: Mesa's iPhone app, coming next, gets a notification when a session asks a question, needs permission or finishes a turn while you are away from the Mac, sealed on your Mac so Mesa's broker never reads it. Settings > Phone already picks when to push and how many idle minutes count as away, and `mesa phone push-test` sends a test push. (#1074)
- Your sessions on your phone: Mesa's iPhone app, coming next, lists every session on your Mac in its Agents tab, grouped Needs you, Working and Done and updated live, and opens one to its goal, latest replies and output. Your Mac already answers it with the Mesa app open or closed, through `mesa phone serve`, which pairing sets to run in the background. (#1077)
- Local URLs from sessions: a Globe in the title bar counts the local addresses sessions' dev servers printed that are still listening, and its menu opens one in the browser or goes to its session. `mesa ports` lists them.
- Merge a pull request from Mesa: the pull request screen has a Merge button with squash, merge commit or rebase, and `mesa prs merge` does the same through gh. A pull request with failing checks or a conflict is merged only once you confirm, and never past branch protection.
- Child reports reach a busy parent: when a Claude Code or Codex parent's turn ends with news from its child sessions waiting, it goes straight on with that news instead of waiting to be idle. Run `mesa hooks install` (Codex asks you to review its hooks once more) to turn it on.
- Resolve decision gates in the app: a gate's notice in the bell menu, and its blocked task's row on the Crew panel, show the question with one button per option, and one click gives the agent your answer.
- Notes on the Session diff: hover a line and click its +, or drag over several, to write a note for the agent; Send notes sends every unsent note as one prompt, and each note then shows Sent, or Stale once its lines change.
- Notes list: the Session diff lists a session's review notes by file beside the diff, with Copy all and Clear sent; a sent note whose lines the agent changed reads Changed since sent, and Resolve hides it once checked.
- Send review notes: `mesa review notes send` sends a session's unsent notes, or one file's, to its agent as one prompt, each with the lines it quotes, through the guardrail.
- Review notes: `mesa review notes add` keeps a note on exact lines of a session's diff, committed work included, as a draft that quotes those lines and shows when they change.
- Review voice: write how you comment on pull requests in your profile's `prs/voice.md`, and review sessions draft every comment that way. `mesa prs voice` and Settings > Sessions > PR reviews show the file and whether it is set.
- Progress line on session cards: an agent runs `mesa progress "<text>"` to say what it is on now, and its card shows that line under its state until the session ends.
- Setup beside the agent: with Run setup set to Beside the agent in Settings > Git & Worktrees, a new session's worktree setup runs in its own window next to the session while the agent starts at once, and a setup that fails shows up in the Inbox naming that window.
- Sleeping sessions: turn on Settings > Sessions > Sleep finished sessions, and a Claude Code or Codex session you have read and left idle quits its agent after 30 minutes, 2 hours or 8 hours to free its memory. Its card shows Sleeping, and `mesa wake` reopens the same conversation in the same session.
- Plan work as tasks with dependencies: `mesa tasks create "<spec>" --graph <name> --deps <id,id>` records a task, ready when what it waits on has succeeded, and `mesa tasks --ready` and `mesa tasks show <id>` say what can start and what holds the rest.
- Start planned tasks with workers: `mesa worker <project> --task <id>` starts a ready task, and the worker's `done` or `failed` report settles it, so the tasks waiting on it become ready on their own. A worker that ends without a report, or three failed starts, fail the task; `mesa tasks retry` and `mesa tasks cancel` manage the rest.
- Sleeping sessions wake by themselves: opening one in the app, `mesa send` to it, or a child report or PR event for it reopens its conversation first, then the prompt is typed.
- Worker brief: a session started from another with a goal now learns it is a worker, that its last reply each turn goes back to its parent, and not to poll; the mesa skill teaches the orchestrate flow, and session details show which session a child reports to.
- Workers on a cheaper model: `mesa worker` and `mesa open` take `--model` and `--effort` (Claude Code and Codex), kept for a resume, and the New worker dialog has Model and Effort selects, so mechanical work can run on Sonnet instead of the default model.
- Workers ask their parent questions: `mesa report question` gives the question an id, the parent answers it with `mesa reports reply`, and the answer comes back as the worker's next prompt. A parent's session details list its open questions, each with a reply box.
- Worktree sizes: a project's Worktrees cards show each worktree's size on disk and the total, and sort by name, size or age, so the biggest are easy to find and remove. `mesa worktrees list --sizes` does the same.

### Changed

- Inside a session, `mesa sessions --json`, `mesa sessions <id> --children --json` and `mesa show <id> --json` print a compact view, a few fields per session, so an agent checking its workers rereads about 87% fewer bytes; `--full` prints every field. Outside a session, and in the app, nothing changes.
- Faster Claude Code turns in Mesa sessions: the hooks that only log, such as the one after every tool call, now run in the background, so Claude Code no longer waits on Mesa. Run `mesa hooks install`, or Update on the hooks card, to get them.
- The Session Board updates the moment an agent's state changes, and the app runs far fewer background checks: it looks when a hook event lands instead of every two seconds, with a slow check every 10 seconds (30 while the window is in the background) as a fallback.
- Session cards keep more: an ended session's card still shows its last reply, and the `+added -removed` count includes new files that are not committed yet, matching the crew panel.
- Pull requests on session cards: a card now finds its branch's pull request even when it is older than the newest 100, and compact cards show the number too, on the title row.
- A large `node_modules` now carries into a new worktree: when the checkout and the worktree share one APFS volume, a clone takes almost no disk, so it may carry up to 250,000 entries, while a plain copy keeps the 2 GiB and 50,000-entry limit.
- Cheaper skill runs: commit and pull request text and session summaries now run on Haiku, and import notes on Sonnet, instead of your default model, so Mesa's own background work costs a fraction of what it did.
- The Crew panel shows a coordinator's work at a glance: a count by state over a progress bar, your pending choices first, then one card per task with its worker folded in, saying what it is doing now and what it waits for by task title.
- The Crew panel and a coordinator's worker rows colour each state: done reads green, working blue, waiting on you amber and failed red, in the progress bar, on each task's icon and status line, and on the sidebar's worker icons. In the light theme the waiting and idle colours are darker so they stay readable.
- Fairer patches for generated commit messages and pull request text: the patch they read is 60 KB, split fairly by file, so a lockfile or generated file no longer hides the source changes after it; a cut file says how much of it is not shown.
- The Git tab shows which checkout it is on: a labelled picker beside the branch name names the checkout's folder ("Main checkout" for the registered one), and its list marks any checkout stopped in a merge, rebase or cherry-pick.
- Leaner skill runs: Mesa's own runs (vault capture, git text, session summaries, import notes) start without your MCP servers, user settings, plugins and hooks, mounting only mesa-vault where they need it, so each starts from about 19k tokens of context instead of 44k.
- The Session Board looks faster while your Claude Code sessions are active: it skips asking Claude Code for its session list when every session's latest hook already says what it is doing.
- Faster Output log reads: Mesa reads only the end of a session's Output log when it needs its last lines, so the title bar's dev server links and skill runs stay quick with long logs.
- Send notes repeats the review notes still open: a second send includes every sent note not yet resolved, under "Still open from the last round" with its lines as they read now, and the Session diff header counts the notes the next send holds.
- Quieter workers: a worker's brief tells it to send its parent no progress messages, its report being the one message, and the mesa skill tells a coordinator to take a worker's evidence as given and rerun its checks only where there is a gap.
- Shorter child reports: a worker's report keeps about three sentences (600 characters), and `mesa report done --details <file>` names a file with the rest, which the parent sees as a path in the report, the Crew panel and the session details, and reads only when it needs to.
- Held child reports: a worker's finished turn reaches its parent only once the worker has stayed idle for two minutes, so a worker mid-way through many turns wakes its parent once, with its siblings' reports in the same prompt. Settings > Sessions sets the hold, or turns it off.
- Resolve with AI hands over every conflict: the agent gets all the conflict hunks in a file beside the checkout's git data, not just the first 5 KB.
- Sharper PR reviews: a review session now scores each finding from 1 to 10 and leaves only those scored 7 or higher as draft comments, and it looks for reuse, simpler code, duplication and modules doing more than one job, not only bugs.
- Parallel worktree setup for every project of a session: with `setupWhile: parallel`, each project a session adds with `--with` runs its setup in its own Setup session beside the agent, opened in that project's worktree, instead of holding up the start.
- Setup beside the agent now runs in its own Setup session, a child of the session on the board: open it from its card or from the Inbox notice when it fails, and stop or remove it like any session. The agent is told about it even when it started without a goal.
- A coordinator's workers now sit inside its sidebar card, one row each with its state, task title and what it is doing now; a click opens the worker. Setup sessions no longer get their own cards: a failed setup shows as a red mark that opens it.
- Session switcher puts what needs you first: with nothing typed it lists sessions waiting on a permission or a question first, then unread ones, then idle ones, and typing a branch or a pull request number like `#123` finds its session.
- Vault capture saves less: it keeps only decisions and findings a later session will still act on in a month, at most 3 at a time, and skips review rounds, passing status and details that belong in the code.
- Vault capture runs on Claude Haiku: the run that picks what a session saves to the vault no longer uses your default model, so it costs about a twentieth of what it did on Opus.
- Coordinator rules and a nesting cap for workers: the mesa skill tells a coordinator to start every worker and end its turn, and to use its own subagents for small work; a worker starts no workers unless its task asks; and workers nest at most 4 deep, with each worker's depth shown in its session details.
- Faster worktrees that carry ignored files: a new worktree now copies the files and folders you list, such as `.env` or `node_modules`, as APFS clones that take almost no disk, and stops with a warning instead of copying more than 2 GiB or 50,000 entries. The setting is now `worktrees.carry`, in Settings > Git & Worktrees; the old `carryIgnoredDirectories` still works.
- Faster session starts on a new branch with fetch on: Mesa now fetches only the branch's base, such as `origin/main`, instead of every remote, and reuses a fetch from the last 30 seconds. When the fetch fails, the session starts from the local copy with a warning instead of not starting.
- Cheaper reads across many files: Claude sessions are told to ask an Explore agent on Haiku for a question spread over many files and keep only its answer, so the files are not carried through the rest of the session. (#1085)

### Fixed

- A session an agent queues with `mesa open --after` is now that agent's own child: it gets the worker brief and reports back to it, not to the session it waited on, which is over by then.
- Going back to an earlier Mesa no longer breaks it: settings a newer Mesa wrote to your profile's config are ignored instead of stopping every command and hook, and `mesa doctor` names each one it ignores, which also catches a typo in the file. (#1088)
- A session's workers stay with it after a restart or a handoff: when a parent is resumed or hands off, its children sit under the new session on the Board and in `mesa sessions --tree`, their reports and questions go to it, and a worker that hands off keeps reporting to its own parent. `mesa show <id> --json` adds `parentNow`.
- Send notes on a plain terminal's diff sends the notes to a new agent instead of failing, and a send that fails says why in its toast.
- Long messages reach the agent whole: a message of 2 to 3 KB that Mesa typed into a Claude Code session, such as Fix with AI's hook output or Resolve with AI's conflicts, lost its start. Mesa now pastes long messages.
- Worktree setup and teardown written as one command string, such as `["node --test test/"]`, now get a warning showing the split form, `[node, --test, test/]`, when you save them in `mesa config set`, a project's mesa.yaml or Settings, and their failure says why instead of a bare exit 127.
- Setup sessions show how their setup went: once the worktree setup exits, its Setup session reads failed or done in `mesa sessions` and on the Board, instead of working while its shell stays open.
- Vault capture saves fewer repeats: a capture now searches with other words, and across the whole vault when a session talks about another project, so it no longer saves a decision the vault already holds, one the session saved itself, or one another session made, and a capture whose answer writes an empty field as null no longer fails.
- Vault capture updates its own notes: when a session changes a decision or note it captured earlier, the next capture replaces that note instead of adding a second one beside it under a new title.
- Note names in the vault: a note or decision with a long title is now named after its title cut at a whole word, so a file name no longer ends mid-word.
- Agents run the right `mesa`: a session's agent now reaches the Mesa that started it, even when another `mesa` comes first on your PATH, such as a dev build beside the app or an older CLI.
- A worker row in a coordinator's sidebar card now shows what the worker reported: a check once it reports done, even while its agent stays open. A coordinator's progress line goes once all its tasks have settled, and a failed setup shows as a warning icon beside the row's time only while the worker has not settled.
- Worktree sizes no longer stall: a worktree too large to measure within a minute waits 10 minutes before Mesa tries again, instead of slowing every Worktrees list.

## 0.3.12 - 2026-11-02

### Changed

- A session started on a ticket works on a branch that reads like its name: the ticket's key, then its title's words, such as har-219-berth-schedule-export, instead of the key alone. `mesa open --from <ticket> --worktree` names it the same way. (#872)

### Fixed

- A message Mesa types into a session sends on its own again: a zero-width space, a bidi mark or a stray control character in it made Claude Code hold the message with "Removed 1 invisible character" until someone pressed Enter. Mesa now leaves those characters out. (#872)

## 0.3.11 - 2026-10-27

### Added

- Resizable file list in diffs: drag the edge between the changed files and the diff, in a session's Diff or a pull request's Files tab, to see long names in full. Mesa keeps the width for both, the diff always keeps room beside it, and a double-click puts the default back. (#868)

## 0.3.10 - 2026-10-27

### Added

- Folder tree in diffs: a session's Diff and a pull request's Files tab list the changed files in their folders, each folder collapsible, with a toggle back to the flat list that Mesa remembers. (#866)

### Fixed

- Notifications name the session: a finished turn or a question says the session's name in the macOS notice and the Inbox, not its id. (#863)
- The Remove dialog no longer offers to delete a worktree a newer session took over, such as a later review round's: it says the worktree stays, with its branch. (#865)
- Reviewing a pull request again after its author force-pushed works: the review worktree moves to the new head instead of reporting commits to push, and removing an older review round keeps the worktree the newer round now uses, and says so. (#864)

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
