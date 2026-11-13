import { terminalPalette } from '@mesa/core/phone';
import type { Ref } from 'react';
import { useColorScheme } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { terminalPage } from './page/terminalPage';

/**
 * The page the output terminal draws in (page/terminalPage), in the terminal palette for the
 * phone's appearance (Mesa Dark or Light, as the desktop's terminals follow the interface), with
 * orca's WebView settings (TerminalWebView.tsx): the page handles its own scrolling and text size.
 */
export function TerminalPage({
  ref,
  onMessage,
}: {
  ref: Ref<WebView<object>>;
  onMessage: (event: WebViewMessageEvent) => void;
}) {
  const html = terminalPage(terminalPalette({ theme: 'follow' }, useColorScheme() === 'dark'));
  return (
    // Its props are `WebViewProps & P`, never with the default P (undefined): name one.
    <WebView<object>
      ref={ref}
      source={{ html }}
      originWhitelist={['*']}
      javaScriptEnabled
      scrollEnabled={false}
      nestedScrollEnabled
      scalesPageToFit={false}
      textZoom={100}
      onMessage={onMessage}
      style={{ backgroundColor: 'transparent' }}
    />
  );
}
