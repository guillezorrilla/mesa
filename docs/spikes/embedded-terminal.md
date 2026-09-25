# Spike SP-3: xterm.js over a Rust pty attached to tmux in a Tauri webview

Issue #8, run 2026-09-25 on macOS (Darwin 25.6), tmux 3.7c, Tauri 2.11, WKWebView (`AppleWebKit/605.1.15`, device pixel ratio 2), and Claude Code 2.1.283. The code is on branch `spike/embedded-terminal` (commits `931b812` and `1d34004`, never merged): `apps/desktop/src-tauri/src/spike.rs` and `apps/desktop/src/spike/SpikeTerminal.tsx`. Only this document carries forward into #28.

## What was built

- **Rust.** `spike_open(cols, rows, mode, flags)` spawns `tmux -L mesa-spike attach-session -t spike [flags]` through portable-pty 0.9.0 with `TERM=xterm-256color`. A reader thread reads the master in 64 KiB chunks and emits each chunk as a Tauri event `term://data`. It also has `spike_write` (the path xterm's `onData` uses), `spike_resize` (the pty's size), `spike_pane_size` (`tmux display -p '#{pane_width}x#{pane_height}'`), `spike_tmux` (for the page's own option checks), and `spike_close` (kills the client only).
- **Renderer.** `@xterm/xterm` 6.0.0 with `@xterm/addon-fit` 0.11.0 and `@xterm/addon-webgl` 0.19.0 fills the window. `onData` goes to `spike_write`, and a window resize runs fit and then `spike_resize`.
- **Measurement.** A script in the page measures on load and appends JSON lines to a file named by `MESA_SPIKE_REPORT`.
- **Pane.** It runs `bash --norc --noprofile` under `env -i` on its own server (`-L mesa-spike -f /dev/null`, `default-terminal tmux-256color`). The owner's default tmux server is never touched. In the first pass that `env -i` left the pane with `TERM=dumb`. The second pass passed `TERM=tmux-256color`, which is what Mesa's windows get.

## Results

| Check | Result |
| --- | --- |
| portable-pty | 0.9.0 (`native_pty_system`, `openpty`, `spawn_command`, `try_clone_reader`, `take_writer`, `resize`). It builds with Tauri 2.11 and needs no extra permissions. |
| Payload shape | **base64 strings.** A 5,000,000-byte `yes` burst took 1,704 ms with base64, delivering 10.7 MB of tmux redraws in 38,733 events (about 6.3 MB/s). With byte arrays (`Vec<u8>`, which Tauri serialises as a JSON array of numbers) it took about the same time, 1,744 ms, but delivered only 1.06 MB in 44,264 events. Each mode ran once, base64 first. The likely reading: number arrays are about 3.5 characters per byte and slowed the event path, so tmux dropped frames for the slower client. |
| Keystroke latency | Invoke `spike_write('x')` to the next data event (the echo, with the pane idle at a shell prompt): median 2 ms, p95 6 ms, max 9 ms (20 samples). Not measured under load. |
| Resize, one client | After `fit` and `spike_resize`, the pane is xterm's cols by rows minus one: 131x44 to 131x43, 158x51 to 158x50, back to 131x43. The missing row is the tmux status line, and this held with and without `-f ignore-size`. With `status off` the pane matched exactly: 131x44 and 158x51. |
| Resize, two clients | Measured with control-mode clients next to the app's own client:<br>- An `ignore-size` client (150x45) did not change the pane while a normal client was attached; it stayed 131x43.<br>- A normal 100x30 client took the window at once (pane 100x30, `window-size latest`), and the size came back when it left.<br>- **When every client is `ignore-size`**, as with the app and `mesa attach`, tmux ignores the flag: one 150x45 client gave a 150x45 pane, a second 100x30 client made it 100x30, and it went back to 150x45 when the second left. |
| Claude TUI | Claude Code 2.1.283 rendered in the embedded xterm: the banner, the trust dialog, the prompt, "Creating empty file ...", and the Bash permission dialog ("Do you want to proceed?" with four numbered options and "Esc to cancel · Tab to amend"). All were legible at font size 13 in a 1000x700 window. Claude was driven with `tmux send-keys` (arrows, Enter, Esc, `/exit`). Input through the app's own path (`spike_write`, which `onData` uses) was exercised by the latency, burst, and `seq` commands, not by typing into Claude. |
| Colours | They depend on the pane's TERM. The pane in Mesa's setup is `tmux-256color` (from `default-terminal`), and Claude drew its 256-colour palette. With `TERM=dumb` (a shell whose env was cleared) it drew monochrome. COLORTERM was unset, so there was no truecolor; the mascot came out salmon rather than its orange. |
| TERM | The pty client runs with `TERM=xterm-256color`, and the pane sees `tmux-256color`. |
| addon-webgl | It loaded in WKWebView with no `onContextLoss` during the run. The screenshots were taken with it active. |
| Mouse scroll | Synthetic wheel events on `.xterm-screen`, five of them. **With tmux `mouse off` (the default), scrolling broke:** tmux draws on xterm's alternate screen, so xterm has no scrollback (`baseY` 0). xterm turned the wheel into five Up-arrow keys sent to the program, and the shell recalled its history. In Claude that would move its menus. **Fix:** `set mouse on`. xterm then sends SGR wheel sequences (`\e[<64;1;1M`), and tmux enters copy mode and scrolls its own history (`pane_in_mode` 1). A physical trackpad sends the same `wheel` events to xterm; it was not tried by hand. |
| Clipboard | **The web clipboard broke:** in WKWebView, `navigator.clipboard.writeText` and `readText` both failed with `NotAllowedError` (from the page, with no user gesture), and `document.execCommand('copy')` returned false. The pasteboard was saved in full beforehand and restored after. **Fix for #28:** with tmux `mouse on`, a drag selects in tmux copy mode. tmux's `set-clipboard external` (the default) sends the copy to the outer terminal as OSC 52. An OSC 52 handler in xterm (`term.parser.registerOscHandler(52, ...)`) then writes it to the macOS pasteboard through a Rust command, not `navigator.clipboard`. Paste goes the other way, Rust to `term.paste`. None of this was built in the spike. xterm's own selection (Cmd+C via `term.getSelection()`) only applies when tmux does not take the mouse. A real Cmd+C keypress (a user gesture) was not tried. |

## Reproduction

1. Check out `spike/embedded-terminal`, then run `pnpm install` and `cargo build` in `apps/desktop/src-tauri`.
2. Start the pane in a scratch folder, keeping TERM:

   ```
   tmux -L mesa-spike -f /dev/null new-session -d -s spike -x 120 -y 40 -c "$(mktemp -d)" \
     "env -i HOME=$HOME USER=$USER PATH=$PATH LANG=en_US.UTF-8 TERM=tmux-256color bash --norc --noprofile -i" \
     \; set -g default-terminal tmux-256color \; set -s exit-empty off
   ```
3. Run `MESA_SPIKE_REPORT=/tmp/spike.jsonl pnpm -C apps/desktop tauri dev`. The window moves to (40, 40) at 1000x700 and stays on top. The script records these lines:
   - `start` (webgl, user agent);
   - `size` (the attach with `-f ignore-size`), `term`, `latency`;
   - `burst` for base64, then for bytes;
   - `size` at 1200x800 (with and without `ignore-size`), at 1000x700, and with `status off`;
   - `wheel` with mouse off, then on;
   - `clipboard-1` and `clipboard-2`;
   - finally `ready`.

   The clipboard lines overwrite the pasteboard, so save it first.
4. For the TUI, drive the pane from a shell: `tmux -L mesa-spike send-keys -t spike:0 'claude --permission-mode manual' Enter`. The run used `default`, which 2.1.283 accepted; `--help` lists `manual`. Then send a prompt that runs a Bash command, and the window shows the permission dialog. To check that closing the app leaves the agent running, quit the app and read `#{pane_current_command}`: it stayed `2.1.283`, with 0 clients.
5. For the two-client sizes, run `(printf 'refresh-client -C 100x30\n'; sleep 3) | tmux -L mesa-spike -C attach -t spike` (add `-f ignore-size` for the other cases) and read `#{pane_width}x#{pane_height}`. The measured cases used 150x45 and 100x30 clients.

## How the reference app does it, and the choice for #28

the reference app 0.40.0 (`/Applications/the reference app.app`, the owner's Electron app) runs each agent in its own tmux session and shows it the same way this spike does. The owner asked for this comparison; it was read from the app bundle's code, and the reference app was not launched.

| Part | the reference app |
| --- | --- |
| Attach | `node-pty` runs `tmux -u attach -t <session>` with `TERM=xterm-256color` at the view's cols and rows, with no `-f ignore-size`. |
| Renderer | xterm.js with its WebGL renderer, in the dashboard bundle. |
| Size | After each fit, `tmux resize-window -t <session> -x <cols> -y <rows> ; set-option -w -t <session> -u window-size`. The window takes the view's size, and the unset returns it to the default policy instead of leaving `resize-window`'s `manual` pin. |
| Session options | `mouse on`; `status off`; `history-limit 50000`; `allow-passthrough on`; `set-clipboard external`, so tmux sends copies to the outer terminal as OSC 52; copy-mode mouse bindings that keep copy mode after a drag (`copy-pipe-no-clear`); `terminal-features 'xterm*:hyperlinks'` for OSC 8 links. |
| Exit | A `pane-died` hook writes the pane's last 100 lines and its exit status to files, then kills the session. |

**Choice for #28: the same mix.** tmux keeps the session, the screen history, and the size. A pty attach streams it to xterm.js, which renders and takes input. the reference app's setup answers this spike's problems one for one:

- `mouse on` fixes the wheel sending arrow keys (gotcha 4).
- `status off` makes the pane match xterm exactly (gotcha 2), and it also hides the kitty-probe pane title (gotcha 7).
- An explicit `resize-window` then `set -w -u window-size` sizes the window, which `-f ignore-size` alone does not (gotcha 3). The pair was run once headlessly, with one client (`window-size` went `manual` until unset), and not with two.
- `set-clipboard external` plus an OSC 52 handler in xterm (`term.parser.registerOscHandler(52, ...)`) that writes through Rust gets copies out of WKWebView, whose web clipboard is refused (gotcha 5).

Measured headlessly for the other way, tmux alone with no xterm:

- `capture-pane -e -p` of a Claude screen (131x43) took 6.9 ms median and 10 ms max, with 3 KB and 72 colour sequences.
- tmux control mode reported `%output` 19.5 ms after a `send-keys`.
- `resize-window` took 11 ms and set the window's `window-size` to `manual`.

Rendering that capture as styled text would drop cursor, mouse, and scrollback fidelity. So it stays the board's last-output preview, not the terminal.

## Gotchas for P2 (#28)

1. **Emit base64, not byte arrays.** Byte arrays serialise as JSON numbers, and in the one run per mode they delivered a tenth of the bytes in the same time. Decode with `Uint8Array.from(atob(s), c => c.charCodeAt(0))` and write the `Uint8Array` to xterm.
2. **Turn the status line off for the embedded view, or budget one row for it.** With `status off`, the pane matched xterm exactly. With it on, xterm rows 44 give a pane of 43.
3. **`-f ignore-size` does not stop the app and a terminal fighting.** When every attached client is `ignore-size` (the app, plus `mesa attach` in the user's Terminal), tmux ignores the flag and the latest client sizes the window. #28 sizes explicitly, as the reference app does: `resize-window -x -y` after each fit, then `set -w -u window-size`. The intent is that the last view to resize wins, since that is the one in use. It was not measured with two clients, so #28 checks it. ADR-0001 and ADR-0007 are amended to match.
4. **Set `mouse on`, or the wheel sends arrow keys to the agent.** On tmux's alternate screen xterm has no scrollback, so the wheel becomes Up and Down keys. With `mouse on`, tmux takes the wheel into copy mode. This also changes the user's Terminal attach.
5. **The clipboard goes through Rust.** The web clipboard API and `execCommand('copy')` are refused in WKWebView. With `mouse on`, copies come from tmux copy mode, and `set-clipboard external` (the default; a server option) forwards them as OSC 52. Register an OSC 52 handler in xterm that calls a Rust command to write the pasteboard. the reference app's handler calls `navigator.clipboard`, which works in Electron but not in WKWebView. Paste comes from a Rust read, then `term.paste`. Not built in the spike.
6. **Keep TERM in the pane.** An env-cleared shell reads `TERM=dumb`, and Claude then draws in monochrome. Mesa's windows inherit `tmux-256color` from `default-terminal`, which gives the 256-colour palette. For the real palette, set `COLORTERM=truecolor` in the window (`new-window -e`) and add `terminal-features ',xterm-256color:RGB'`. That last step was not tried.
7. **Claude probes the kitty graphics protocol, and through tmux the probe shows up as the pane title.** The status line read `"Gi=31,s=1,v=1,a=q,t=d"` until Claude set its own title. With the status line off (gotcha 2) it is not shown. Otherwise set `allow-set-title off` for Mesa's windows, or leave `#{pane_title}` out of the status line.
8. **Kill only the client on close.** `child.kill()` on the portable-pty child ends `tmux attach`. When the app quit, Claude kept running in its pane (`2.1.283`, 0 clients) and the window stayed.
9. **One reader thread per terminal, and keep the handler cheap.** Tauri events are fire-and-forget, so a slow handler lets events queue in the webview; tmux drops frames only when the pty reader falls behind. Decode and `term.write`, nothing else.
10. **Scrollback belongs to tmux** (gotcha 4): xterm's `baseY` stayed 0 while the pane was on the alternate screen.
11. **Window position and always-on-top were spike-only.** They kept the screenshots to the app's window; #28 must not do either.

Open, and tracked elsewhere:
- Codex's TUI: v1 runs Claude Code only (ADR-0003 amendment); tracked in #43.
- A physical trackpad and a real Cmd+C keypress were not tried by hand, since the synthetic events take the same paths in xterm. Check them once #28 lands.

## Footprint of the run

The Claude Code runs used the owner's login in a temp folder, which was then deleted. They left that folder's trust entry in `~/.claude.json` and four short session transcripts under `~/.claude/projects/`. The screenshots were taken of the app window's region only, read once, and deleted, because Claude's status line showed the account name. No screenshot is committed.
