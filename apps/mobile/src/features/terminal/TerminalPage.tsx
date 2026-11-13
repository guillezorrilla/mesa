import type { Ref } from 'react';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

/**
 * The page the output terminal draws in (page/terminalPage), with orca's WebView settings
 * (TerminalWebView.tsx): the page handles its own scrolling, zoom and text size.
 */
export function TerminalPage({
  ref,
  html,
  onMessage,
}: {
  ref: Ref<WebView<object>>;
  html: string;
  onMessage: (event: WebViewMessageEvent) => void;
}) {
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
