// The output terminal's page (TerminalPage): one xterm drawing a session's output, as orca's
// terminal document does. The app sends `init` (the screen), `write` (what the window printed
// since) and `bottom`; the page sends `size` (the cols and rows that fit), `away` (scrolled up from
// the newest line) and `copy` (the text chosen). Built into the page by build-terminal-page.mjs.
/* global Terminal, FitAddon */
(() => {
  const post = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(message));
  // orca's terminal options (terminal-init.ts, theme.ts): 13 px, light strokes, a bar cursor.
  const term = new Terminal({
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: 13,
    fontWeight: '300',
    fontWeightBold: '500',
    scrollback: 5000,
    cursorStyle: 'bar',
    cursorBlink: false,
    cursorInactiveStyle: 'block',
    disableStdin: true,
    theme: window.MESA_THEME,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  const surface = document.getElementById('terminal');
  term.open(surface);

  let size = '';
  const refit = () => {
    fit.fit();
    const next = `${term.cols}x${term.rows}`;
    if (next === size) return;
    size = next;
    post({ type: 'size', cols: term.cols, rows: term.rows });
  };

  // Away while the newest line is out of view; xterm keeps the view still as lines arrive then.
  let away = false;
  const track = () => {
    const buffer = term.buffer.active;
    const next = buffer.viewportY < buffer.baseY;
    if (next === away) return;
    away = next;
    post({ type: 'away', away });
  };
  term.onScroll(track);
  term.onWriteParsed(track);

  const receive = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'init') {
      term.reset();
      term.write(message.data, () => {
        term.scrollToBottom();
        track();
      });
    } else if (message.type === 'write') term.write(message.data);
    else if (message.type === 'bottom') term.scrollToBottom();
  };
  // iOS delivers the app's messages on window, Android on document.
  window.addEventListener('message', receive);
  document.addEventListener('message', receive);

  // Touch, as orca's surface: a drag scrolls the lines; a long press (500 ms, 10 px of slop)
  // selects the line under it and a drag stretches the selection, then Copy or Select all.
  const menu = document.getElementById('menu');
  const cellHeight = () => term.element.querySelector('.xterm-screen').clientHeight / term.rows;
  const rowAt = (y) => {
    const top = term.element.querySelector('.xterm-screen').getBoundingClientRect().top;
    const row = Math.floor((y - top) / cellHeight());
    return term.buffer.active.viewportY + Math.max(0, Math.min(term.rows - 1, row));
  };
  let press;
  let startY = 0;
  let lastY = 0;
  let carry = 0;
  let anchor;
  surface.addEventListener(
    'touchstart',
    (event) => {
      const y = event.touches[0].clientY;
      startY = y;
      lastY = y;
      carry = 0;
      anchor = undefined;
      menu.hidden = true;
      term.clearSelection();
      clearTimeout(press);
      press = setTimeout(() => {
        anchor = rowAt(y);
        term.selectLines(anchor, anchor);
      }, 500);
    },
    { passive: true },
  );
  surface.addEventListener(
    'touchmove',
    (event) => {
      event.preventDefault();
      const y = event.touches[0].clientY;
      if (anchor !== undefined) {
        const row = rowAt(y);
        term.selectLines(Math.min(anchor, row), Math.max(anchor, row));
        return;
      }
      if (Math.abs(y - startY) > 10) clearTimeout(press);
      carry += lastY - y;
      lastY = y;
      const lines = Math.trunc(carry / cellHeight());
      if (!lines) return;
      term.scrollLines(lines);
      carry -= lines * cellHeight();
    },
    { passive: false },
  );
  surface.addEventListener('touchend', () => {
    clearTimeout(press);
    if (anchor !== undefined && term.hasSelection()) menu.hidden = false;
  });
  document.getElementById('copy').addEventListener('click', () => {
    post({ type: 'copy', text: term.getSelection() });
    term.clearSelection();
    menu.hidden = true;
  });
  document.getElementById('all').addEventListener('click', () => term.selectAll());

  window.addEventListener('resize', refit);
  requestAnimationFrame(refit);
})();
