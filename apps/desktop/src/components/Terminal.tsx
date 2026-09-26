import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal as Xterm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'react';
import { fromBase64 } from '../lib/bytes';
import { usePlatform } from '../lib/MesaRoot';
import { useRun } from '../lib/useCommand';

/**
 * An OSC 52 payload (`c;<base64>`): the text a tmux copy sends out, or null for a query or a
 * payload that does not decode (pane output reaches this parser too).
 */
const osc52Text = (data: string) => {
  const encoded = data.slice(data.indexOf(';') + 1);
  if (!encoded || encoded === '?') return null;
  try {
    return new TextDecoder().decode(fromBase64(encoded));
  } catch {
    return null;
  }
};

/**
 * One session's tmux window in the app: xterm.js 6 over the Rust pty (ADR-0007, SP-3). It fits
 * its box, and after each fit the window takes the size (`mesa resize`). A copy in tmux (a mouse
 * drag, with `mouse on`) arrives as OSC 52 and goes to the pasteboard; Cmd+V is the webview's
 * own paste. Unmounting closes only the tmux client.
 */
export function Terminal(props: { sessionId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const platform = usePlatform();
  const run = useRun();
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // Option-drag selects in xterm itself (a plain drag goes to tmux's copy mode, `mouse on`).
    const term = new Xterm({
      fontSize: 13,
      cursorBlink: true,
      macOptionClickForcesSelection: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    // SP-3: WebGL loads in WKWebView; without it xterm draws with the DOM.
    try {
      term.loadAddon(new WebglAddon());
    } catch {}
    const { terminal, clipboard } = platform;
    let termId: string | undefined;
    let closed = false;
    let sent = '';
    const offs: (() => void)[] = [];
    // The window follows only a real change: a resize drag fires many observations, and each
    // `mesa resize` is a CLI run.
    const size = async () => {
      if (closed) return;
      fit.fit();
      const now = `${term.cols}x${term.rows}`;
      if (!termId || now === sent) return;
      sent = now;
      await terminal.resize(termId, term.cols, term.rows);
      await run('sessions.resize', { id: props.sessionId, cols: term.cols, rows: term.rows });
    };
    term.parser.registerOscHandler(52, (data) => {
      const text = osc52Text(data);
      if (text !== null) clipboard.write(text).catch(() => {});
      return true;
    });
    term.onData((data) => {
      // After the attach ended, a keystroke has nowhere to go.
      if (termId) terminal.write(termId, data).catch(() => {});
    });
    (async () => {
      fit.fit();
      const id = await terminal.open(props.sessionId, term.cols, term.rows);
      termId = id;
      offs.push(await terminal.onData(id, (chunk) => term.write(chunk)));
      offs.push(await terminal.onExit(id, () => term.write('\r\n[detached]\r\n')));
      // Unmounted meanwhile: the cleanup below already ran, so undo what came after it.
      if (closed) {
        for (const off of offs) off();
        return terminal.close(id);
      }
      await terminal.ready(id);
      await size();
    })().catch((e) => {
      if (!closed)
        term.write(`\r\ncould not attach: ${e instanceof Error ? e.message : String(e)}\r\n`);
    });
    const observer = new ResizeObserver(() => {
      size().catch(() => {});
    });
    observer.observe(el);
    return () => {
      closed = true;
      observer.disconnect();
      for (const off of offs) off();
      if (termId) terminal.close(termId);
      term.dispose();
    };
  }, [platform, run, props.sessionId]);
  return (
    <div
      ref={host}
      className="h-[420px] bg-black p-1"
      data-testid={`terminal-${props.sessionId}`}
    />
  );
}
