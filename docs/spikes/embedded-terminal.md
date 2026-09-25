# Spike SP-3: xterm.js over a Rust pty attached to tmux in a Tauri webview

Issue #8, run 2026-09-25 on macOS (Darwin 25.6), tmux 3.7c, Tauri 2.11, WKWebView (`AppleWebKit/605.1.15`, device pixel ratio 2), and Claude Code 2.1.283. The code is on branch `spike/embedded-terminal` (commit `931b812`, never merged): `apps/desktop/src-tauri/src/spike.rs` and `apps/desktop/src/spike/SpikeTerminal.tsx`. Only this document carries forward into #28.

## What was built

- **Rust.** `spike_open(cols, rows, mode, flags)` spawns `tmux -L mesa-spike attach-session -t spike [flags]` through portable-pty 0.9.0 with `TERM=xterm-256color`. A reader thread reads the master in 64 KiB chunks and emits each chunk as a Tauri event `term://data`. It also has `spike_write`, `spike_resize` (the pty's size), `spike_pane_size` (`tmux display -p '#{pane_width}x#{pane_height}'`), and `spike_close` (kills the client only).
- **Renderer.** `@xterm/xterm` 6.0.0 with `@xterm/addon-fit` 0.11.0 and `@xterm/addon-webgl` 0.19.0 fills the window. `onData` goes to `spike_write`, and a window resize runs fit and then `spike_resize`.
- **Measurement.** A script in the page measures on load and appends JSON lines to a file named by `MESA_SPIKE_REPORT`.
- **Pane.** It runs bash with no rc files, on its own server (`-L mesa-spike -f /dev/null`, `default-terminal tmux-256color`), and never touches the owner's default tmux server.

## Results

| Check | Result |
| --- | --- |
| portable-pty | 0.9.0 (`native_pty_system`, `openpty`, `spawn_command`, `try_clone_reader`, `take_writer`, `resize`). It builds with Tauri 2.11 and needs no extra permissions. |
| Payload shape | **base64 strings.** A 5,000,000-byte `yes` burst took 1,704 ms with base64: 10.7 MB of tmux redraws in 38,733 events, about 6.3 MB/s. With byte arrays (`Vec<u8>`, which Tauri serialises as a JSON array of numbers) it took 1,744 ms but delivered only 1.06 MB in 44,264 events. The JSON number arrays were the bottleneck, and tmux dropped frames to keep up. |
| Keystroke latency | Invoke `spike_write('x')` to the echo arriving as an event: median 2 ms, p95 6 ms, max 9 ms (20 samples). |
| Resize, one client | After `fit` and `spike_resize`, the pane is xterm's cols by rows minus one: 131x44 to 131x43, 158x51 to 158x50, back to 131x43. The missing row is the tmux status line. This held with and without `-f ignore-size`. |
| Resize, two clients | Measured with control-mode clients. An `ignore-size` client (150x45) did not change the pane while a normal client was attached (it stayed 131x43). A normal 100x30 client took the window at once (pane 100x30, `window-size latest`), and the size came back when it left. |
| Claude TUI | Claude Code 2.1.283 rendered in the embedded xterm: the banner, the trust dialog, the prompt, "Creating empty file ...", and the Bash permission dialog ("Do you want to proceed?" with four numbered options and "Esc to cancel · Tab to amend"). All were legible at font size 13 in a 1000x700 window. Keys typed into the pane (arrows, Enter, Esc, `/exit`) worked. |
| Colours | They depend on the pane's TERM. The pane in Mesa's setup is `tmux-256color` (from `default-terminal`), and Claude drew its 256-colour palette. With `TERM=dumb` (a shell whose env was cleared) it drew monochrome. COLORTERM was unset, so there was no truecolor; the mascot came out salmon rather than its orange. |
| TERM | The pty client runs with `TERM=xterm-256color`, and the pane sees `tmux-256color`. |
| addon-webgl | It loaded in WKWebView with no `onContextLoss` during the run. The screenshots were taken with it active. |
| Mouse scroll, clipboard | **Not verified: this needs a person at the window.** See the owner check below. |

## Owner check (about 2 minutes)

On branch `spike/embedded-terminal`, first start the pane:

```
tmux -L mesa-spike -f /dev/null new-session -d -s spike -x 120 -y 40 \; set -g default-terminal tmux-256color \; set -s exit-empty off
```

Then run `MESA_SPIKE_REPORT=/tmp/spike.jsonl pnpm -C apps/desktop tauri dev`. Wait for the `ready` line in the report, then:

1. Run `seq 1 500` in the terminal and scroll with the trackpad. Note whether xterm scrolls its own buffer, or whether tmux needs `mouse on` (with `mouse on`, tmux copy mode takes the scroll).
2. Select text with the mouse and press Cmd+C, then paste into another app. Then Cmd+V into the terminal. Note what works; WKWebView may need `navigator.clipboard` handling in the page.
3. Afterwards run `tmux -L mesa-spike kill-server`.

## Reproduction

1. Check out `spike/embedded-terminal`, then run `pnpm install` and `cargo build` in `apps/desktop/src-tauri`.
2. Start the pane as in the owner check above. A pane shell with an empty environment reads `TERM=dumb`, so keep `default-terminal` and do not clear TERM.
3. Run `MESA_SPIKE_REPORT=/tmp/spike.jsonl pnpm -C apps/desktop tauri dev`. The window moves to (40, 40) at 1000x700 and stays on top. The script then records these lines: `start` (webgl, user agent), `size` (the attach with `-f ignore-size`), `term`, `latency`, `burst` for base64, `burst` for bytes, then `size` at 1200x800 (with and without `ignore-size`) and at 1000x700, and finally `ready`.
4. For the TUI, drive the pane from a shell: `tmux -L mesa-spike send-keys -t spike:0 'claude --permission-mode default' Enter`, then send a prompt that runs a Bash command. The window shows the permission dialog.
5. For the two-client sizes, run `(printf 'refresh-client -C 100x30\n'; sleep 3) | tmux -L mesa-spike -C attach -t spike` and read `#{pane_width}x#{pane_height}`. Repeat with `-f ignore-size`.

## Gotchas for P2 (#28)

1. **Emit base64, not byte arrays.** Byte arrays serialise as JSON numbers, about 3.5 characters per byte, and throughput fell by 10x. Decode with `Uint8Array.from(atob(s), c => c.charCodeAt(0))` and write the `Uint8Array` to xterm.
2. **Budget one row for the tmux status line.** xterm rows 44 give a pane of 43. Either turn the status line off for Mesa's sessions (`status` is a session option, so it goes for every client), or size the view from `display -p` (not measured).
3. **`-f ignore-size` means the app never sizes the window while another client is attached.** When the user's Terminal (`mesa attach`, also `ignore-size`) and the app are both attached, whichever normal client is latest wins, and an `ignore-size` client just renders a larger or smaller window. The embedded view must follow the pane size it is given, reading `#{pane_width}x#{pane_height}` after each resize, not assume that fit wins. Without `ignore-size` the app and a terminal fight over the size (`window-size latest`).
4. **Set `COLORTERM=truecolor` in Mesa windows** (`new-window -e`), and tell tmux the outer terminal has RGB (`terminal-features ',xterm-256color:RGB'`), so Claude draws its real palette.
5. **Never clear TERM in the pane.** An env-cleared shell reads `TERM=dumb`, and Claude then draws in monochrome. Mesa's windows inherit `tmux-256color` from `default-terminal`, which is right.
6. **Claude probes the kitty graphics protocol, and through tmux the probe shows up as the pane title.** The status line read `"Gi=31,s=1,v=1,a=q,t=d"` until Claude set its own title. Either hide the title in the embedded client (`set -w automatic-rename off`, and no `#{pane_title}` in the status line), or ignore it on the board.
7. **Kill only the client on close.** `child.kill()` on the portable-pty child ends the `tmux attach` process; the window and the agent keep running (checked: the pane survived every re-attach in the run).
8. **One reader thread per terminal, with backpressure.** Tauri events are fire-and-forget, so the 64 KiB chunks arrive as fast as tmux sends them. tmux itself drops frames for a slow client, which is what saves the byte-array case. Keep the event handler cheap: decode and `term.write`, nothing else.
9. **Scrollback belongs to tmux.** xterm's own scrollback holds only what tmux redrew. The owner check above decides whether mouse scrolling goes to tmux (`mouse on`) or to xterm.
10. **Window focus and always-on-top were spike-only.** The page moved and pinned its own window so the screenshots show just the app; #28 must not do either.

## Footprint of the run

The Claude Code runs used the owner's login in a temp folder, which was then deleted. They left that folder's trust entry in `~/.claude.json` and three short session transcripts under `~/.claude/projects/`. The screenshots were taken of the app window's region only, read once, and deleted, because Claude's status line showed the account name. No screenshot is committed.
