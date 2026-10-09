import type { Config } from '@mesa/core';
import { DEFAULT_TERMINAL_PREFERENCES, terminalPalette } from '@mesa/core/browser';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as Xterm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useMemo, useRef } from 'react';
import { fromBase64 } from '@/lib/bytes';
import { usePlatform } from '@/lib/MesaRoot';
import { oneAtATime } from '@/lib/oneAtATime';
import { useRun } from '@/lib/useCommand';
import { useInterfaceDark } from '@/lib/useInterfaceDark';
import { terminalInputForKey } from './terminalInput';
import { wheelForwarder } from './terminalWheel';
import { useFocusOnEmptyClick } from './useFocusOnEmptyClick';

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
export function Terminal(props: {
  sessionId: string;
  preferences?: Config['terminal'];
  fill?: boolean;
  /** Takes the keyboard once attached, and again whenever it turns true: the session in view. */
  focus?: boolean;
  onFileLink?: (session: string, target: string) => void;
  onWebLink?: (session: string, url: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const xterm = useRef<Xterm | null>(null);
  const refit = useRef<(() => void) | null>(null);
  const onFileLink = useRef(props.onFileLink);
  onFileLink.current = props.onFileLink;
  const onWebLink = useRef(props.onWebLink);
  onWebLink.current = props.onWebLink;
  const focusRef = useRef(props.focus);
  focusRef.current = props.focus;
  const preferences = props.preferences ?? DEFAULT_TERMINAL_PREFERENCES;
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const dark = useInterfaceDark();
  const colors = props.preferences?.colors;
  const palette = useMemo(
    () => terminalPalette({ theme: preferences.theme, colors }, dark),
    [preferences.theme, colors, dark],
  );
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
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
      theme: paletteRef.current,
    });
    xterm.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    // The WebGL addon left live WKWebView panes black after selection; xterm's default renderer
    // displays the same native tmux output through view switches.
    const { terminal, clipboard } = platform;
    term.attachCustomKeyEventHandler((event) => {
      const input = terminalInputForKey(event, preferencesRef.current, term.hasSelection());
      if (input === null) return true;
      event.preventDefault();
      if (input) term.input(input, true);
      return false;
    });
    let termId: string | undefined;
    let closed = false;
    let sent = '';
    const wheel = wheelForwarder({
      view: () => ({
        mouse: term.modes.mouseTrackingMode !== 'none',
        alternate: term.buffer.active.type === 'alternate',
        rows: term.rows,
        cols: term.cols,
        box: term.element?.querySelector('.xterm-screen')?.getBoundingClientRect(),
      }),
      speed: () => preferencesRef.current.scrollSpeed,
      // Wrapped: the browser's frame functions throw when called off `window`.
      frames: {
        request: (run) => requestAnimationFrame(run),
        cancel: (id) => cancelAnimationFrame(id),
      },
      send: (reports) => {
        if (termId) terminal.write(termId, reports).catch(() => {});
      },
    });
    term.attachCustomWheelEventHandler(wheel.onWheel);
    const offs: (() => void)[] = [];
    // The window follows only a real change, one `mesa resize` at a time: a resize drag fires
    // many observations, each `mesa resize` is a CLI run, and two in flight could finish out of
    // order. Changes during one run once after it, at the size the box has then.
    const size = oneAtATime(async () => {
      if (closed) return;
      fit.fit();
      const { cols, rows } = term;
      if (!termId || `${cols}x${rows}` === sent) return;
      sent = `${cols}x${rows}`;
      await terminal.resize(termId, cols, rows);
      await run('sessions.resize', { id: props.sessionId, cols, rows });
    });
    refit.current = () => void size();
    term.parser.registerOscHandler(52, (data) => {
      const text = osc52Text(data);
      if (text !== null) clipboard.write(text).catch(() => {});
      return true;
    });
    const links = term.registerLinkProvider({
      provideLinks(lineNumber, callback) {
        const text = term.buffer.active.getLine(lineNumber - 1)?.translateToString(true) ?? '';
        const web = [...text.matchAll(/https?:\/\/[^\s<>"'`]+/g)].map((match) => {
          const target = match[0].replace(/[),.;!?\]}]+$/, '');
          const start = (match.index ?? 0) + 1;
          return {
            text: target,
            range: {
              start: { x: start, y: lineNumber },
              end: { x: start + target.length - 1, y: lineNumber },
            },
            activate: () => onWebLink.current?.(props.sessionId, target),
          };
        });
        const matches = [
          ...text.matchAll(
            /(?:^|[\s('"`])((?:\/?[\w.@+-]+\/)*[\w.@+-]+\.[\w+-]+:\d+(?::\d+)?)(?=$|[\s),;])/g,
          ),
        ];
        callback([
          ...web,
          ...matches.flatMap((match) => {
            const target = match[1] as string;
            const start = (match.index ?? 0) + match[0].indexOf(target) + 1;
            if (web.some((link) => start >= link.range.start.x && start <= link.range.end.x))
              return [];
            return [
              {
                text: target,
                range: {
                  start: { x: start, y: lineNumber },
                  end: { x: start + target.length - 1, y: lineNumber },
                },
                activate: () => onFileLink.current?.(props.sessionId, target),
              },
            ];
          }),
        ]);
      },
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
      if (focusRef.current) term.focus();
      await size();
    })().catch((e) => {
      if (!closed)
        term.write(`\r\ncould not attach: ${e instanceof Error ? e.message : String(e)}\r\n`);
    });
    const observer = new ResizeObserver(() => {
      // A hidden Board (another screen open) leaves the box no width: the window keeps its size.
      if (el.clientWidth) size().catch(() => {});
    });
    observer.observe(el);
    return () => {
      closed = true;
      wheel.dispose();
      observer.disconnect();
      for (const off of offs) off();
      links.dispose();
      if (termId) terminal.close(termId);
      term.dispose();
      xterm.current = null;
      refit.current = null;
    };
  }, [platform, run, props.sessionId]);
  // Selecting another session (or opening a new one) puts the cursor in its agent.
  useEffect(() => {
    if (props.focus) xterm.current?.focus();
  }, [props.focus]);
  useFocusOnEmptyClick(props.focus, () => xterm.current?.focus());
  useEffect(() => {
    if (xterm.current) xterm.current.options.theme = palette;
  }, [palette]);
  useEffect(() => {
    const term = xterm.current;
    if (!term) return;
    term.options.fontSize = preferences.fontSize;
    term.options.fontFamily = preferences.fontFamily;
    term.options.macOptionIsMeta = preferences.optionAsMeta;
    // Scrolls xterm's own buffer only; tmux's history follows terminalWheel.ts.
    term.options.scrollSensitivity = preferences.scrollSpeed;
    refit.current?.();
  }, [
    preferences.fontSize,
    preferences.fontFamily,
    preferences.optionAsMeta,
    preferences.scrollSpeed,
  ]);
  return (
    <div
      ref={host}
      className={
        props.fill ? 'terminal-host min-h-[240px] flex-1 p-1' : 'terminal-host h-[420px] p-1'
      }
      style={{ background: palette.background }}
      data-testid={`terminal-${props.sessionId}`}
    />
  );
}
