# Spike: smooth, responsive scrolling in the session terminal

Issue: #572. Date: 2026-10-05. macOS (Darwin 25.3.0), tmux 3.7c, `@xterm/xterm` 6.0.0 (and `@xterm/headless` 6.0.0 for replays). Builds on SP-3 (`docs/spikes/embedded-terminal.md`) and ADR-0007 with its two amendments.

**Outcome:** keep tmux as the owner of the scrollback, and fix the two things that make the wheel feel coarse: tmux scrolls 5 lines per wheel report, and xterm sends at most one report per wheel event whatever the Scroll Speed setting says. The app should turn each wheel event into as many one-line reports as the finger moved, coalesced into one write per animation frame, and tmux should scroll one line per report for the app's view only. tmux keeps up with that at 2,400 lines a second with no backlog. Handing the scrollback to xterm was tried headlessly and loses history: a 5,000-line burst left 41 lines in xterm's buffer. A native-scrolling history overlay (xterm filled from `capture-pane`) is the next step only if the one-line fix still does not feel right by hand. Moving the renderer back to WebGL is a separate, conditional follow-up.

No ADR amendment is needed: tmux still owns the scrollback (SP-3 gotcha 10 stands).

## How a wheel event travels today

1. **WKWebView fires a `wheel` event** on xterm's element. A trackpad gives many small `deltaY` values in pixels (`deltaMode` 0) at about the display rate, then momentum events; a mouse wheel gives larger steps.
2. **xterm sees mouse tracking on.** On attach, tmux (with `mouse on`) sends `\e[?1000h \e[?1002h \e[?1006h` and switches xterm to its alternate screen with `\e[?1049h` (recorded on the private socket, below). With tracking on, xterm's `bindMouse` handler takes the wheel (`src/browser/CoreBrowserTerminal.ts`, the `case 'wheel'` branch).
3. **xterm decides whether to send a report.** `CoreMouseService.consumeWheelEvent` computes `deltaY * scrollSensitivity / cellHeightCss`, times 0.3 when `|deltaY| < 50` (a likely trackpad), and accumulates fractions. If the whole-line amount is non-zero, xterm sends **one** SGR report, `\e[<64;col;rowM` (up) or `\e[<65;col;rowM` (down). The line count only gates the report: 1 line and 12 lines both send one report. `Terminal.tsx` sets `scrollSensitivity` from `terminal.scrollSpeed` (default 3), so Scroll Speed changes only how often a trackpad crosses the threshold. A mouse-wheel notch always sends exactly one report.
4. **Into the pty.** `term.onData` calls `terminal.write`, a Tauri invoke of `term_write` (`apps/desktop/src-tauri/src/terminal.rs`), which queues the bytes for the pty's writer thread. The pty runs `tmux new-session -t =<project> -s _view-<id>` (`attachArgv` in `packages/core/src/sessions/tmux/backend.ts`), a client of the profile's server.
5. **tmux's root table.** The default binding (tmux 3.7c, `list-keys -T root`):

   ```
   WheelUpPane  if-shell -F "#{||:#{alternate_on},#{pane_in_mode},#{mouse_any_flag}}" { send-keys -M } { copy-mode -e }
   ```

   If the pane is on its own alternate screen, already in a mode, or its program asked for the mouse, tmux passes the report to the program. Otherwise the **first** report only enters copy mode (`-e`: leave it when scrolled back to the bottom) and does not scroll; tmux redraws the whole pane, about 4.5 KB for 120x40. `WheelDownPane` has no root binding.
6. **Copy mode.** Both copy tables (Mesa's server keeps `mode-keys emacs`) bind:

   ```
   WheelUpPane    select-pane \; send-keys -X -N 5 scroll-up
   WheelDownPane  select-pane \; send-keys -X -N 5 scroll-down
   ```

   Mesa changes only `MouseDragEnd1Pane` (`COPY_BINDINGS` in `packages/core/src/sessions/tmux/server-options.ts`).
7. **The redraw back.** `-N 5` runs five one-line scrolls. Each one sends `\e[1L` (insert a line at the top), the new line, and a fresh copy-mode position indicator (`copy-mode-position-format`, for example `11:27 [2/2965]`). That is about 1,160 bytes per report for five lines. The bytes come back through the reader thread as a base64 `term://data/<id>` event, and `term.write` parses them. xterm's DOM renderer then repaints the rows that moved on the next animation frame (the WebGL renderer was removed in the 2026-09-28 amendment).

The result on a trackpad: one report per about 18 px of finger travel at Scroll Speed 3 (16 px rows / (3 x 0.3)), and each report moves the content 5 rows, about 80 px. The text moves about 4.5 times as far as the finger, in 5-row jumps, with no fraction of a row in between. xterm's own smooth scrolling (`smoothScrollDuration`) never applies: xterm is on the alternate screen, with no scrollback of its own.

With **Natural Mouse Selection** on, the view session has `mouse off`. xterm is still on the alternate screen, so its other wheel branch sends Up and Down arrow keys to the program (SP-3 gotcha 4). In an agent that recalls prompt history or moves a menu. This was read from xterm's code and SP-3; it was not tried by hand.

## Measurements

All runs used a private server (`tmux -L mesa-spike-572 -f /dev/null`) with Mesa's `SERVER_OPTIONS`, a 120x40 pane, and about 9,000 lines of history. Each line is coloured and about 110 characters long, like an agent's tool output. A Python client held a real pty with `TERM=xterm-256color`, attached like the app, wrote the same SGR reports xterm writes, and timed the bytes that came back. A reply counts as finished after 40 ms with no further byte. The server was killed after each run, and no Mesa or personal server was touched.

### tmux, per wheel report

| Lines per report (`-N`) | Bytes back per report | Bytes per line | Report to first byte, median / p95 / max (ms) |
| --- | --- | --- | --- |
| 1 | 275 | 275 | 2.4 / 4.7 / 6.2 |
| 3 | 727 | 242 | 4.1 / 6.2 / 6.6 |
| 5 (default) | 1,160 | 232 | 4.9 / 7.1 / 8.5 |
| 10 | 2,247 | 225 | 7.8 / 10.9 / 11.8 |

- Entering copy mode (the first report): 4,466 bytes, a full redraw, 1.5 to 3.6 ms, and no scroll.
- A keystroke echoed at a shell prompt on the same client: median 0.12 ms, p95 1.4 ms. A wheel report costs about 0.5 ms of tmux time per line, which a keystroke does not.
- The reply to one report arrives as one chunk: first byte and last byte are within 0.1 ms of each other.

### tmux under trackpad-rate input

The client sent 120 frames at 120 Hz, and each frame was one `write` of k reports.

| Setup | Lines per second asked | Lines scrolled | Bytes back | Lag after the last frame |
| --- | --- | --- | --- | --- |
| `-N 1`, 1 report a frame | 120 | 120 | 35 KB | none |
| `-N 3`, 1 report a frame | 360 | 360 | 87 KB | 1.7 ms |
| `-N 5`, 1 report a frame (today at best) | 600 | 600 | 139 KB | none |
| `-N 1`, 4 reports a frame | 480 | 480 | 136 KB | none |
| `-N 1`, 10 reports a frame | 1,200 | 1,200 | 338 KB | none |
| `-N 1`, 20 reports a frame | 2,400 | 2,400 | 685 KB | none |

tmux is not the bottleneck at any of these rates. 2,400 lines a second is 685 KB/s, which is 0.9 MB/s as base64. SP-3 measured the event path at about 6 MB/s.

`send-keys -X -N` takes a format on 3.7c. With `-N '#{?@mesa-wheel-lines,#{@mesa-wheel-lines},5}'`, setting `@mesa-wheel-lines 1` on the session made one report scroll 1 line. Setting it to 7 made it scroll 7. A session without the option keeps 5. So the app's view can scroll one line per report while `mesa attach` in Terminal.app keeps tmux's 5. The proposed root binding, which runs `copy-mode -e` and then the same scroll, was checked too. Three reports moved the view 3 lines with the option set to 1, and 15 lines without it, so the first report scrolls instead of only entering copy mode.

### Could xterm own the history? (option 2, replayed headlessly)

The private server ran with `mouse off` and `terminal-overrides 'xterm*:smcup@:rmcup@'`, so tmux does not put xterm on the alternate screen. The client's bytes were recorded, fed into `@xterm/headless` 6.0.0 at 120x40 with 10,000 lines of scrollback, and xterm's buffer was compared with `capture-pane -p -J -S -`.

| Pane output | tmux history (lines) | Lines in xterm's buffer | Notes |
| --- | --- | --- | --- |
| 300 lines, one every 3 ms (an agent streaming) | 306 | 302 | tmux scrolled with line feeds, so xterm kept them. |
| `seq 1 5000` (a burst) | 5,006 | **41** | tmux redraws the screen when output outruns the client, so nothing scrolls into xterm. |
| 60 lines, a program on the pane's alternate screen, then 60 more | 126 | 40 | The fast 60 lines were redrawn, not scrolled. Leaving the alternate screen redraws too. |
| The pane asks for `?1000h ?1006h` with `mouse off` | n/a | n/a | tmux still forwards the program's mouse modes to xterm. |
| The same runs with tmux's defaults (smcup on) | any | 40 | xterm stays on the alternate screen with no scrollback, as in SP-3. |

**tmux is a screen redrawer, not a byte stream.** xterm can only keep what tmux happens to scroll, so a live stream cannot fill xterm's history reliably. Owning the scrollback in xterm would mean filling it from `capture-pane`, not from the stream.

### The cost of filling xterm from capture-pane (option 2b)

| `capture-pane -p -e -J` range | Time, median | Bytes |
| --- | --- | --- |
| last 200 lines | 7.0 ms | 23 KB |
| last 1,000 lines | 7.8 ms | 114 KB |
| full history (9,965 lines) | 38 ms | 1.14 MB |

Most of the 7 ms is the tmux process starting. Parsing the full 1.14 MB capture in `@xterm/headless` (Node, no rendering) took 11.6 ms median (8.9 to 20.2 ms). JavaScriptCore in WKWebView and the DOM renderer will be slower; that was not measured. As base64 over the event path, the full history is about 250 ms at SP-3's rate, and the last 1,000 lines about 25 ms. A `mesa` CLI call adds the 50 to 100 ms Node start-up from ADR-0007.

### What was not measured

- **Real trackpad feel.** The wheel event rate and `deltaY` values WKWebView produces, the momentum phase, and how the result looks. All need hands on the app.
- **Render cost in WKWebView.** How long xterm's DOM renderer takes to repaint a 120x40 screen after `\e[1L`, and whether frames drop. No GUI here, and headless xterm does not render.
- **The full app round trip.** Wheel to pixels through `term_write`, the pty, tmux, the event, and the paint. SP-3 measured a keystroke's invoke-to-echo at a 2 ms median (p95 6 ms) in the app. Adding the tmux time here and one frame of paint, the estimate is 10 to 25 ms per report today. That is an estimate, not a measurement.
- **Whether Claude Code or Codex panes ask for the mouse or use the alternate screen.** If they do, today's wheel goes to the program, not to copy mode. No agent was run in this spike.

### How the owner can measure by hand

1. Run `pnpm -C apps/desktop tauri dev`, open a session, and right-click to Inspect, which opens Web Inspector. Paste this into the console, then scroll with the trackpad:

   ```js
   const el = document.querySelector('.terminal-host .xterm');
   let n = 0, px = 0, small = 0;
   el.addEventListener('wheel', (e) => { n++; px += e.deltaY; if (Math.abs(e.deltaY) < 50) small++; }, { capture: true, passive: true });
   setInterval(() => { if (n) console.log(`${n} wheel/s, ${px.toFixed(0)} px, ${small} under 50px`); n = px = small = 0; }, 1000);
   ```

   It gives the event rate and travel that the fix's line maths depends on.
2. In Web Inspector's Timelines, record 5 seconds of steady scrolling. Read the frame rate and the split between JavaScript and layout or paint per frame. If paint dominates, the WebGL follow-up matters. If frames are idle between reports, the granularity fix is the whole story.
3. Compare three views of the same long output, such as `seq 1 10000` in a session:
   - Terminal.app on its own: native, pixel-smooth scrollback.
   - Terminal.app running `mesa attach <id>`: tmux copy mode, 5 lines per notch.
   - The app.

   If the second already feels like the app, the gap is tmux's line steps. If the app is worse than the second, the gap is the app's path or renderer.
4. Read-only, on the owner's own server: `tmux -L mesa-<profile> list-panes -a -F '#{window_name} alt=#{alternate_on} mouse=#{mouse_any_flag}'`. It shows whether agent panes take the wheel themselves.

## Options

### 1. tmux tuning tied to Scroll Speed (recommended)

Two changes, one per side:

- **tmux (core).** Bind the wheel in both copy tables to `send-keys -X -N '#{?@mesa-wheel-lines,#{@mesa-wheel-lines},5}' scroll-up` (and `scroll-down`). Make the root `WheelUpPane` scroll on entry too, so the first report is not spent on entering copy mode. The app's view session gets `@mesa-wheel-lines 1`, and other attaches keep 5.
- **App.** An `attachCustomWheelEventHandler` runs while xterm's `modes.mouseTrackingMode` is not `none`. It accumulates `deltaY` in pixels, using xterm's row height read from the screen element. It converts that to whole lines scaled by Scroll Speed, so 3 tracks the finger one to one. Once per animation frame it writes that many one-line reports in one `terminal.write`, then returns false so xterm sends nothing itself. `DOM_DELTA_LINE` and `DOM_DELTA_PAGE` convert by rows. One frame is capped at one screen of lines. While tracking is `none` on the alternate screen (Natural Mouse Selection), the handler swallows the wheel, so no arrow keys reach the agent.

| | |
| --- | --- |
| Improves | Content moves one row at a time and in step with the finger, at the display rate. Scroll Speed means lines per row of travel. Fast flicks reach thousands of lines a second (measured, no backlog). The wasted first report goes away. One invoke per frame instead of per event. |
| Breaks | Nothing found. Copy and selection stay tmux copy mode. OSC 52 and pbcopy are unchanged. Programs that ask for the mouse get k reports per frame instead of one per event (`send-keys -M` passes each through), which is how a wheel with acceleration looks to them. Resize, the history limit and the 10,000 lines are unchanged. External attaches keep `-N 5` because their view lacks the option. |
| Does not fix | Pixel smoothness between rows: tmux scrolls whole rows. Render cost per frame. |
| Size | Two S tasks (core, then app). |

### 2. xterm owns the scrollback (`mouse off` for the app, history replayed)

| | |
| --- | --- |
| Improves | Native scrolling: pixel-smooth with `smoothScrollDuration`, momentum, `scrollSensitivity` as designed, xterm selection and Cmd+C. |
| Breaks | **History correctness.** tmux redraws instead of scrolling when output is fast, so xterm keeps 41 of 5,006 burst lines (measured). The history needs `capture-pane` replays, and they go stale and duplicate against the live stream at every redraw, reattach, window switch and resize. `smcup@` is per TERM in `terminal-overrides`, so it also hits Terminal.app attaches, unless the app's pty gets its own TERM and terminfo entry. Resize reflow: tmux reflows its history and xterm reflows its own copy differently, so the two diverge. Programs on the pane's alternate screen: the wheel scrolls xterm's stale history above them unless they asked for the mouse (their mouse modes do pass through, measured). tmux copy mode, its search and the drag-to-pbcopy binding leave the app. Agent `/clear` and `clear-history` must be mirrored. |
| Size | L, several PRs, and an ADR-0007 amendment. Not recommended. |

### 2b. A native history overlay (only if option 1 is not enough)

On the first scroll up from the bottom, the app captures the pane's history with `capture-pane -p -e -J -S -<n> -E -1`: the last 1,000 lines first, the rest after. It fills a second, read-only xterm laid over the live one, which scrolls natively with `smoothScrollDuration`, momentum and xterm selection. Scrolling back to the bottom or any keypress removes it. tmux still owns the history; the overlay is a snapshot, as tmux's own copy mode is.

| | |
| --- | --- |
| Improves | Terminal.app-like pixel scrolling and selection over the whole history. |
| Breaks or costs | Costs 30 to 130 ms to open: about 8 ms of tmux, about 25 ms of transfer for 1,000 lines, plus Node start-up if it goes through the CLI. Output that arrives while it is open is not shown until it closes. A second xterm instance holds up to 10,000 lines. The overlay must not open when the pane is on its alternate screen or asked for the mouse (`#{alternate_on}`, `#{mouse_any_flag}`), so it needs that state. It is a new capability, so it lands three times: core, `mesa` subcommand, app. |
| Size | M to L. Write a spike or issue only after option 1 has been tried by hand. |

### 3. Other levers

- **`smoothScrollDuration`:** no effect while tmux owns the scrollback, because xterm's viewport never scrolls. It applies only to 2 and 2b.
- **`scroll-up -N` alone, without the app change:** a global `-N 1` makes every report one line, but xterm still sends one report per event. A trackpad would then be slow, and Terminal.app attaches would get 1 line per notch. Use it only behind the per-view option, as in option 1.
- **Coalescing per frame:** part of option 1. Measured, tmux keeps up even without it. It mainly saves invokes and parser passes.
- **WebGL renderer:** it would cut paint time for every redraw, not only scrolling, but it is the path the 2026-09-28 amendment removed for black panes. It is worth a bounded retry only if the hand measurement shows paint dominating. Load it only while the terminal is visible, dispose it when hidden, and fall back to the DOM renderer on `onContextLoss`.
- **Copy-mode position indicator:** tmux 3.7 redraws `[n/total]` and a timestamp on every step. It is cheap (part of the 230 to 275 bytes per line) and useful, so keep it.

## Recommendation

Do option 1 as two tasks, core then app, and have the owner try it by hand with steps 1 to 3 above. If the result still feels steppy because of whole-row motion, open a spike for 2b. If paint is slow, as Timelines would show, open the WebGL retry. Do not hand the scrollback to xterm's live stream (option 2): it loses history under fast output.

## Proposed follow-up issues

### 1. `sessions: let the app's terminal scroll tmux one line per wheel report`

#### Goal

tmux's wheel bindings scroll by a per-view line count, 1 for the app's embedded terminal and tmux's 5 for every other attach.

#### Context

`docs/spikes/terminal-scrolling.md` (#572): tmux's copy tables scroll 5 lines per wheel report, so the app's terminal jumps in 5-row steps. `send-keys -X -N` takes a format on tmux 3.7c, so a session user option can set the count per view (CONTEXT.md, Session Window and view sessions; ADR-0007 amendment 2026-09-25). The app attaches through `mesa attach --print`.

#### Acceptance criteria

- [ ] `COPY_BINDINGS` (`packages/core/src/sessions/tmux/server-options.ts`) binds `WheelUpPane` and `WheelDownPane` in `copy-mode` and `copy-mode-vi` to `select-pane \; send-keys -X -N '#{?@mesa-wheel-lines,#{@mesa-wheel-lines},5}' scroll-up` (`scroll-down`). It also binds root `WheelUpPane` to tmux's default condition, with `copy-mode -e` followed by the same scroll, so the first report scrolls. A test in `packages/core/src/sessions/tmux/backend.test.ts` asserts all five bindings in `ensureServer`'s args.
- [ ] `attachArgv` takes the app case and then adds `set-option -t =_view-<id> @mesa-wheel-lines 1`. `mesa attach --print` uses it, and `mesa attach` and `mesa attach --app` do not. A backend test and a CLI test show both argv.
- [ ] CONTEXT.md's Session Window entry says the app's view scrolls one line per wheel report and other attaches five.

#### Test plan

1. `pnpm exec vitest run packages/core/src/sessions/tmux/backend.test.ts packages/cli` passes.
2. On a private socket: `tmux -L t572 -f /dev/null new -d -s m 'seq 1 3000; cat'`, apply the bindings, and `set -t m @mesa-wheel-lines 1`. Attach a client and send `\e[<64;10;10M` three times. `tmux -L t572 display -p '#{scroll_position}'` reads 3, because the first report enters copy mode and scrolls. Cancel copy mode, unset the option and repeat: it reads 15. Then `tmux -L t572 kill-server`.
3. `pnpm verify` passes.

#### Out of scope

The app's wheel handling (issue 2). Changing `mode-keys` or the copy-mode indicator.

#### Depends on

None.

#### Size

S

#### Review

Claude runs `/code-review` against this issue before merge; the Spec axis checks every acceptance criterion.

### 2. `app: send the wheel to tmux one line per row of travel, once per frame`

#### Goal

In the session terminal, a trackpad or wheel scrolls tmux's history in one-row steps that follow the finger, scaled by Scroll Speed, with one write per animation frame.

#### Context

`docs/spikes/terminal-scrolling.md` (#572): xterm 6 sends one SGR wheel report per DOM wheel event, whatever `scrollSensitivity` (Scroll Speed) computes, so the setting barely matters and content jumps. tmux keeps up with 2,400 one-line reports a second. With Natural Mouse Selection, xterm sends arrow keys to the agent instead (SP-3 gotcha 4).

#### Acceptance criteria

- [ ] A pure module `apps/desktop/src/features/terminal/terminalWheel.ts` turns `(deltaY, deltaMode, rowHeightPx, rows, scrollSpeed, carry)` into `{lines, carry}`: pixels / row height x scrollSpeed / 3, with the fraction carried, lines and pages by rows, at most `rows` a call. It also builds the SGR report string for n lines up or down at a cell. `terminalWheel.test.ts` covers trackpad pixels, a carried fraction, line and page modes, the cap, and direction.
- [ ] `Terminal.tsx` attaches a custom wheel handler. While `term.modes.mouseTrackingMode !== 'none'`, it adds to the carry, writes the frame's reports in one `terminal.write` on `requestAnimationFrame`, and returns false. While tracking is `none` and xterm's active buffer is `alternate`, it returns false and writes nothing, so no arrow keys reach the agent. Otherwise it returns true.
- [ ] The Scroll Speed setting's description says it sets lines per row of travel. `scrollSensitivity` is no longer what drives tmux scrolling.
- [ ] A test in `Terminal.test.tsx` dispatches wheel events on the host. It sees one `write` per frame, holding the expected number of `\e[<64;` reports.

#### Test plan

1. `pnpm exec vitest run apps/desktop/src/features/terminal` passes.
2. `pnpm -C apps/desktop tauri dev`, then open a session with long output, such as `seq 1 10000` in a General session. A slow two-finger drag moves the text with the finger, row by row. A flick runs through hundreds of lines and stops with the momentum. Scroll Speed 6 moves twice as far as 3.
3. Turn on Natural Mouse Selection and reopen the session. The wheel does not change the agent's prompt.
4. Run the Web Inspector snippet from the spike note: wheel events arrive, and Timelines shows one `term_write` invoke per frame while scrolling.
5. `pnpm verify` passes.

#### Out of scope

Pixel-smooth scrolling between rows (a history overlay) and the WebGL renderer.

#### Depends on

Issue 1.

#### Size

S

#### Review

Claude runs `/code-review` against this issue before merge; the Spec axis checks every acceptance criterion.

### 3. Conditional, after 1 and 2 are tried by hand

- If paint dominates in Timelines: `app: render the visible session terminal with WebGL, falling back on context loss`. It must re-check the ADR-0007 2026-09-28 black-pane case: switching between Board and Sessions in a packaged build, with a typed command visible.
- If whole-row steps still feel coarse: `spike: a native-scrolling history overlay from capture-pane` (option 2b). That would add a `mesa` subcommand for the capture and needs no ADR change, since tmux keeps the history.

## Reproduction

- **Wheel timing.** A Python client opens a pty with `pty.fork`, runs `tmux -L mesa-spike-572 -f /dev/null attach-session -t m` with `TERM=xterm-256color` at 120x40, and writes `\e[<64;60;20M`. It reads with `select` until 40 ms of quiet. The pane is filled first with 9,000 coloured lines from a one-line Python loop. Bindings are switched with `bind-key -T copy-mode WheelUpPane select-pane \; send-keys -X -N <n> scroll-up`. `send-keys -t m -X cancel` leaves copy mode between runs, and `#{scroll_position}` reads how far it moved.
- **Burst rate.** The same client writes k reports per `os.write` every 1/120 s for 120 frames, and reads in between.
- **xterm-owned replay.** The same server with `mouse off` and `set -s terminal-overrides 'xterm*:smcup@:rmcup@'`. The recorded client bytes are written into `new Terminal({cols: 120, rows: 40, scrollback: 10000})` from `@xterm/headless` 6.0.0 (in a scratch folder, `pnpm add @xterm/headless@6.0.0`). The buffer's lines are then compared with `capture-pane -p -J -S -`.
- **Captures.** `capture-pane -p -e -J -S <start> -E -1 -t m`, ten runs each.
