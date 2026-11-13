import type { TerminalColors } from '@mesa/core/phone';
import { ENGINE } from './engine.generated';

/**
 * The output terminal's page: xterm and its bridge (ENGINE) filling the view, in `palette` (its
 * keys are xterm's theme's), with the Copy and Select all menu a long press opens, as orca's.
 */
export const terminalPage = (palette: TerminalColors) => `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${ENGINE.css}
html,body{margin:0;height:100%;overflow:hidden;background:${palette.background};-webkit-user-select:none;-webkit-touch-callout:none}
#terminal{position:absolute;inset:8px 6px 0 10px}
#menu{position:fixed;top:10px;left:50%;transform:translateX(-50%);display:flex;border-radius:10px;overflow:hidden;background:${palette.foreground};z-index:2}
#menu[hidden]{display:none}
#menu button{border:0;background:none;color:${palette.background};font:500 14px -apple-system,system-ui;padding:9px 14px}
#menu button+button{border-left:1px solid ${palette.background}33}
</style></head>
<body><div id="terminal"></div>
<div id="menu" hidden><button id="copy">Copy</button><button id="all">Select all</button></div>
<script>window.MESA_THEME=${JSON.stringify(palette)};</script>
<script>${ENGINE.js}</script>
</body></html>`;
