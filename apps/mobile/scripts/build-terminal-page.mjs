// Builds the output terminal's page engine (as orca's build-terminal-webview-engine does): xterm,
// its fit addon and the page's bridge, with xterm's stylesheet, as strings the app puts in its
// WebView's page. Runs on install; the file it writes is not committed.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(require.resolve(path), 'utf8');
const here = (path) => new URL(path, import.meta.url);
// A script's text ends at the first `</script` in it.
const inline = (text) => text.replaceAll('</script', '<\\/script');

const js = inline(
  [
    read('@xterm/xterm/lib/xterm.js'),
    read('@xterm/addon-fit/lib/addon-fit.js'),
    readFileSync(here('../src/features/terminal/page/bridge.js'), 'utf8'),
  ].join('\n;\n'),
);
const css = read('@xterm/xterm/css/xterm.css');
writeFileSync(
  here('../src/features/terminal/page/engine.generated.ts'),
  `// Built by scripts/build-terminal-page.mjs on install; not committed.\nexport const ENGINE = ${JSON.stringify({ js, css })};\n`,
);
