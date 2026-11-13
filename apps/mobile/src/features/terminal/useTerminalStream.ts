import { terminalPalette } from '@mesa/core/phone';
import * as Clipboard from 'expo-clipboard';
import { useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import type WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { useMac } from '../mac/useMac';
import { useMacUpdates } from '../mac/useMacUpdates';
import { forXterm, fromPage, linesText, streamStep, type ToPage } from './page/pageMessages';
import { terminalPage } from './page/terminalPage';
import { withoutChrome } from './screenChrome';

/** How often a terminal drawn from log lines asks for them again. */
const EVERY_MS = 1000;

/**
 * Session `id`'s output terminal, streamed as orca streams its own: once the page says how many
 * cols and rows fit, the Mac sizes the window to them and sends its screen, then the watch pushes
 * what the window prints (`stream`), written as it comes, or the screen is read again when some
 * was missed. A Mac that sends no screen (an older one, or a session whose window is gone) gives
 * its log's lines instead, an agent's (`agent`) without its screen chrome (#1142), asked every
 * second while the newest line shows. `away` while the person reads back, `jump` to return; a
 * copy from the page goes to the clipboard. The page takes the phone's light or dark palette.
 */
export function useTerminalStream(id: string, agent: boolean) {
  const link = useMac();
  const focused = useIsFocused();
  const page = useRef<WebView<object>>(null);
  const fits = useRef<{ cols: number; rows: number }>(undefined);
  // The log byte the terminal is drawn to, while it draws the window's screen.
  const at = useRef<number>(undefined);
  const lines = useRef(false);
  const reading = useRef(false);
  const [away, setAway] = useState(false);
  const send = (message: ToPage) => page.current?.postMessage(JSON.stringify(message));
  const drawLines = async () => {
    const output = await link.call({ method: 'output', id });
    send({ type: 'init', data: linesText(agent ? withoutChrome(output.lines) : output.lines) });
  };
  const read = () => {
    if (!fits.current || reading.current) return;
    reading.current = true;
    link
      .call({ method: 'screen', id, ...fits.current })
      .then(
        (screen) => {
          at.current = screen.at;
          lines.current = false;
          send({ type: 'init', data: screen.text });
        },
        () => {
          at.current = undefined;
          lines.current = true;
          return drawLines();
        },
      )
      .catch(() => undefined)
      .finally(() => {
        reading.current = false;
      });
  };
  useRepeatWhileActive(EVERY_MS, () => {
    if (focused && lines.current && !away && !reading.current) void drawLines().catch(() => {});
  });
  useMacUpdates((update) => {
    const stream = update.watched?.find((each) => each.id === id)?.stream;
    if (!stream || at.current === undefined) return;
    const step = streamStep(at.current, stream);
    if (step === 'reload') return read();
    if (step !== 'write') return;
    at.current = stream.to;
    send({ type: 'write', data: forXterm(stream.data) });
  });
  const onMessage = (event: WebViewMessageEvent) => {
    const message = fromPage(event.nativeEvent.data);
    if (message?.type === 'size') {
      fits.current = { cols: message.cols, rows: message.rows };
      read();
    } else if (message?.type === 'away') setAway(message.away);
    else if (message?.type === 'copy') void Clipboard.setStringAsync(message.text);
  };
  return {
    page,
    html: terminalPage(terminalPalette({ theme: 'follow' }, useColorScheme() === 'dark')),
    onMessage,
    away,
    jump: () => send({ type: 'bottom' }),
  };
}
