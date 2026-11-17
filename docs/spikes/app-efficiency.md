# Spike: where Mesa's CPU and memory go on the owner's Mac

Date: 2026-11-16. Mesa 0.6.0 release build (`/Applications/Mesa.app`, a Node single executable, ADR-0017), profile `default` with 14 live sessions and 46 board rows, Apple Silicon, 24 GB. The Mac was overloaded before the spike (load average above 100, about 0.5 GB free); every number here comes from one run or a passive sample, never a suite or the dev app.

## What runs, and what each costs

### The app's reads (`run_mesa`, one spawn per call)

The renderer reaches core only through `run_mesa`, which spawns `Contents/MacOS/mesa` once per call (`bridge.rs` `run`, ADR-0007). Every spawn loads all of `@mesa/core` before it reads its argv.

| Command | CPU (user + sys, incl. children) | Peak RSS | Instructions |
| --- | --- | --- | --- |
| `mesa --version` (start-up floor) | 0.17 s | 131 MB | 2.0 G |
| `mesa --json sessions --tree --full` (a board look) | 0.74 s | 251 MB | 5.3 G |
| `mesa --json sessions --tree` | 0.71 s | 246 MB | 5.2 G |
| `mesa --json sessions --archived --full` | 0.53 s | 166 MB | 3.7 G |
| `mesa --json phone push` | 0.27 s | 160 MB | 3.1 G |
| `mesa --json queue list <id>` | 0.18 s | 138 MB | 2.2 G |
| `claude agents --json` (the agent listing, kept 60 s) | 0.25 s | 164 MB | 1.2 G |

`--full` costs nothing measurable (0.74 s against 0.71 s), so dropping it is not a fix.

What a hook event or the fallback poll sets off in the app (`useSessionEvents` subscribers): `sessions.list` (useSessions), `phone.push` (usePhonePush), `notifications.claimDelivery` (useNativeNotifications), `queue.list` when a session is open (useQueuedMessages, also every 2 s while a reply waits), and `sessions.chat` when a Structured chat is open. The Rust watcher (`events.rs`) turns hook-log writes into at most one `sessions://changed` about every 0.85 s; the fallback poll is 10 s focused and 30 s unfocused (#895), so the "2 s poll" read in the coordinator's note is the queue poll and the old comment in `useLookForSelected.ts`, not the board's. `sessions.archived` is read again only when the board's set of ids changes.

So one look costs about **1.4 CPU-seconds in 5 spawns** (0.74 + 0.27 + 0.17 or more + 0.18), of which **0.85 s (62 %) is start-up** paid five times over, and each spawn maps 130 to 250 MB for its half second.

Sampled for 60 s (quiet period, 6 hook events): 12 board looks (6 from events, 6 from the poll), 9 `phone push`, 4 `queue list`, 1 each of `notifications`, `prs`, `reports --deliver`. Hook-event history across the profile's event logs (866 active minutes): median 5 events a minute, p90 17, peak 62.

| Activity | Looks a minute | App CPU a minute | Spawns a minute |
| --- | --- | --- | --- |
| Quiet (measured) | 12 | about 17 s (28 % of a core) | about 60 |
| Busy (events faster than the gap: one look per about 1.4 s) | about 43 | about 60 s (one core) | about 215 |

Inside one `sessions --tree --full` (CPU profile of the release build, `NODE_OPTIONS=--cpu-prof`): of about 450 ms on the main thread, about 175 ms is compiling and initialising the bundle, 73 ms scanning the session store, 48 ms parsing `config.yaml` through zod, 42 ms rewriting and fsyncing the pull-request cache (`saveCache`; this look's list had turned 60 s old, so once a minute, not every look), 33 ms line counts, 26 ms the automation due check. It also starts 18 children per look (PATH shims): one `tmux list-windows`, one `tmux capture-pane` per live session (14), one `tmux set-hook`, two `git`, plus `claude agents --json` once a minute (which itself starts 25 `ps` and 3 `security`).

After the Command server (#1227), the same 10 looks of `sessions --tree --full`, `queue list` and `sessions --archived --full` take 7.8 to 9.9 CPU-s (from 16.3), and what remains is mostly children: `claude agents --json --all` ran 20 times in those 10 looks (0.21 CPU-s each, with 24 `ps`, 3 `security` and a `git`). The kept listing (#896) is reused only while every running Claude session has a hook under 60 s old, and on a board of mostly idle sessions none has, so every look lists. Inside the server, the store scan behind `dueToStart` (about 48 ms a look) and `loadConfig` (about 23 ms a call) are the largest repeat reads.

### Hooks (`mesa hook claude`, a spawn per hook)

Claude Code runs `mesa hook claude` for each hook event of a Mesa session (10 entries in `~/.claude/settings.json`; a tool call is at least PreToolUse and PostToolUse). Inside a session the hook loads all of core like any other command: **0.18 s CPU and 132 MB peak per hook** (throwaway `HOME`, invented session id); the sampler saw live hooks peak at 236 MB. At the p90 event rate that is about 6 CPU-seconds a minute; at the peak, about 22.

### MCP servers (two per Claude session)

37 `mesa vault mcp` and `mesa decisions mcp` processes were running, each a full copy of the single executable: **about 52 MB footprint each** (`footprint -p`), about **1.9 GB** in all, idle. Their RSS reads 1.5 MB because macOS has compressed or swapped them, which is itself memory pressure.

### Long-lived processes

| Process | Footprint | CPU since start |
| --- | --- | --- |
| `mesa-desktop` (the app) | 129 MB | 23 min over 2 days (0.8 %), not counting its children |
| `mesa phone serve` (launch agent `com.mesa.phone.default`) | 104 MB | 8.7 min over 2 days (0.3 %) |
| `tmux -L mesa-default` | 6 MB | 35 min over 10 days |

There is no scheduler process: automations' due check runs inside each board look (`dueToStart`, about 26 ms).

### Leftover tmux servers

| Server | Since | What |
| --- | --- | --- |
| `mesa-demo` | Nov 11 | a live profile server hosting 9 Claude sessions (about 100 MB each, plus their MCP servers) |
| `mesa-smooth1222` | Nov 16 | a worker's throwaway profile, still running a Codex session |
| `mesa-deleted-7202`, `-29272`, `-93905` | Nov 14 to 16 | `seed cat`: left by tests that start a tmux server and never kill it |
| `mesaprobe`, `mesa1178` | Nov 14 | probes agents started by hand |

The `mesa-deleted-*` servers are tiny (under 1 MB) but grow by one per test run. The cost behind `mesa-demo` is its sessions, which are the owner's to stop.

## Ranked causes and fixes

| Rank | Cause | Saved | Fix |
| --- | --- | --- | --- |
| 1 | Start-up per app call: 5 spawns a look, 0.85 of 1.4 CPU-s, 130 to 250 MB each | about 60 % of app CPU (10 s a minute quiet, 36 s busy); 60 to 215 process starts a minute | One long-lived `mesa worker` the app starts once and sends each call to over stdio; spawn per call stays the fallback. Amends ADR-0007 (ADR-0030). |
| 2 | Idle MCP servers: two full copies of core per Claude session | about 1.9 GB now, 104 MB per new session | One MCP endpoint per profile (HTTP on loopback, a per-session token in place of the environment binding, ADR-0011), or failing that a lazy-loading stdio server. |
| 3 | Hook start-up loads all of core | up to 0.18 CPU-s and 130 MB per hook, 6 to 22 CPU-s a minute | A hook fast path that imports only what `hook claude` needs. |
| 4 | The Claude listing on every look over idle sessions | about 0.21 CPU-s and 27 processes a look | Reuse the listing for a minute while every running session has a live window and a hook that is not a wait. |
| 5 | Leftover tmux servers | small per server; the demo profile's sessions about 1 GB | Tests kill the servers they start; `mesa doctor` lists tmux servers of profiles that no longer exist and `--fix` stops them. |

## Commands used

```sh
# Processes and footprints
ps -axo pid,ppid,pcpu,rss,etime,command | grep -E 'mesa|tmux'
footprint -p <pid>

# One run of each command, CPU and peak memory (zsh: ${=c} splits the words)
for c in "--version" "--json sessions --tree --full" "--json sessions --tree" \
  "--json sessions --archived --full" "--json queue list <id>" "--json phone push"; do
  /usr/bin/time -l /Applications/Mesa.app/Contents/MacOS/mesa ${=c} >/dev/null
done

# What the app spawns: sample children for 60 s
while [ $SECONDS -lt $end ]; do ps -axo pid=,ppid=,pcpu=,rss=,time=,command= \
  | grep -E 'Contents/MacOS/mesa (--|hook)'; sleep 0.2; done

# Children of one look: PATH shims that log, then exec, tmux, ps, git, gh, security, claude
PATH=$shims:$PATH mesa --json sessions --tree --full >/dev/null

# Where a look spends its main thread
NODE_OPTIONS="--cpu-prof --cpu-prof-dir=$dir" mesa --json sessions --tree --full >/dev/null

# One hook, under a throwaway home and an invented session
echo '{"hook_event_name":"PostToolUse",...}' | HOME=$tmp MESA_SESSION_ID=zzzzzzzz \
  MESA_PROFILE=probe /usr/bin/time -l mesa hook claude

# Spawn per call against one mesa serve, the same bundle (10 looks of three reads)
python3 -I bench.py spawn node packages/cli/bundle/mesa.mjs
python3 -I bench.py serve node packages/cli/bundle/mesa.mjs

# Hook events a minute, from the profile's event logs (the "at" field, to the minute)
```

## Start-up, measured for #1228

Release-style single executables of the same bundle on Node 26.10 (arm64), `/usr/bin/time -l`, three runs each:

| | `mesa --version` | `mesa hook claude` (throwaway `HOME`) |
| --- | --- | --- |
| Today's build | 0.16 CPU-s, 126 MB | 0.16 CPU-s, 127 MB |
| `useCodeCache: true` | 0.13 to 0.14 CPU-s, 119 MB | |
| Code cache and Defuddle and linkedom loaded on first use | 0.11 to 0.14 CPU-s, 111 MB | 0.11 CPU-s, 111 MB |
| Bare `node -e 0` | 0.04 CPU-s, 50 MB | |

A code cache made by one arch is rejected by the other (`Warning: Code cache data rejected.` on every start), so each slice is built by its own arch's Node, x64 under Rosetta. What is left above bare Node is core's init (about 60 MB and 60 ms): every command, a hook's included, builds `createMesa`, which imports every service. Halving a hook needs a composition root that loads only what a hook uses.

The board read with the listing kept for a minute over idle sessions, 10 `sessions --tree --full` through one `mesa serve` on the owner's profile: 5.6 CPU-s and 470 child processes (10 `claude agents`) before, 3.1 CPU-s and 210 (no `claude agents`) after.

## Leaks, checked 2026-11-16

- **The app's web view: the biggest.** Its WebKit process, which draws the app, had a 725 MB footprint after 2 days 9 hours: 342 MB of graphics memory and 339 MB of WebKit allocations. Every session selected opened a terminal panel that stayed attached, hidden, until its session ended. There were 18, each a tmux client (`_view-*` sessions back to Nov 14), an xterm with a 10,000-line scrollback, and its renderer. Fixed: outside the Grid, a selection keeps the selected terminal and the three selected most recently, and the rest close. tmux keeps their history, so one selected again attaches with it (its scroll position starts at the bottom).
- **`phone serve`: no JS leak.** Its footprint grew from 104 MB to 476 MB in about 7 hours. Through its inspector (SIGUSR1), a forced GC took the heap from 107 MB used to 36 MB, and 60 s of allocation sampling retained 0.7 MB. Its 28 open handles do not grow. The growth is V8 and malloc keeping pages after peaks: 205 MB of V8 pages and 214 MB of malloc against 33 and 29 MB in a fresh `mesa`. The peaks come from work it repeats while a phone watches. It looked at the board up to every 2.5 s, 3.7 CPU-s a minute, and each look ran the Claude listing until #1236. A watched session's detail parses its whole transcript on every write (`readTurns`, 7 MB for a long session). One real unbounded cache was fixed: `keptDiffs` kept every session's and pull request's last diff forever, and now drops each once it is a minute old, at the next diff read.
- **Tried and dropped:** `--max-old-space-size=128` through NODE_OPTIONS. Over 30 looks peak RSS went from 360 to 320 MB but CPU from 10 to 31 s, as NODE_OPTIONS also reaches the agents' Node children.
- **Steady:** the app's Rust process (72 MB, down from 129 MB at the first look), the tmux server (6 MB), and `mesa serve` (exits with the app).

### Addendum: live transcript reads (#1228)

A watched session's detail and the app's chat read a transcript's last 2 MiB (`MESSAGE_TAIL`; the "whole transcript" above was that tail of a 7 MB file) and parsed every line of it on each write. `liveTail` (packages/core/src/lib/live-tail.ts) now keeps each file's parsed lines, a process up to 4 files, each dropped 5 minutes after its last read, and reads only the bytes after its offset; a file that shrank, was replaced, or was rewritten in place is read anew. Results are unchanged, the window still sliding at 2 MiB. Measured on an invented 7.0 MiB transcript in the fixtures' shape (794 turns), 200 appends of one turn each with a read after each, one process per run, three runs:

| | CPU for 200 reads | per read | peak RSS |
| --- | --- | --- | --- |
| Full tail parse (before) | 680 to 734 ms | 3.4 to 3.7 ms | 306 to 341 MB |
| Incremental (after) | 62 to 76 ms | 0.3 to 0.4 ms | 111 to 112 MB |
