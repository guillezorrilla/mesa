import type { TerminalColorKey, TerminalColors } from '@mesa/core/browser';
import type { ReactNode } from 'react';

/**
 * A few sample lines, a prompt, `git diff` and `ls --color`, in the palette's colors. Bold text
 * uses the bright colors, as xterm draws it.
 */
export function PalettePreview(props: { colors: TerminalColors }) {
  const { colors } = props;
  const ink = (key: TerminalColorKey, text: ReactNode, bold?: boolean) => (
    <span style={{ color: colors[key], fontWeight: bold ? 600 : undefined }}>{text}</span>
  );
  const prompt = (command: ReactNode) => (
    <div>
      {ink('cyan', '~/mesa')} {ink('magenta', 'main')}
      {ink('yellow', '*')} {ink('green', '❯')} {command}
    </div>
  );
  return (
    <div
      data-testid="terminal-palette-preview"
      aria-label="Palette preview"
      role="img"
      className="overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed shadow-xs"
      style={{ background: colors.background, color: colors.foreground }}
    >
      <div className="min-w-max">
        {prompt('git diff')}
        <div style={{ fontWeight: 600 }}>diff --git a/src/theme.ts b/src/theme.ts</div>
        <div>
          {ink('cyan', '@@ -4,2 +4,2 @@')} {ink('brightBlack', 'export const terminal = {')}
        </div>
        {ink('red', "-  palette: 'follow',")}
        <br />
        {ink('green', "+  palette: 'tokyo-night',")}
        {prompt('ls --color')}
        <div className="flex gap-4">
          {ink('brightBlue', 'docs/', true)}
          {ink('brightBlue', 'src/', true)}
          {ink('brightGreen', 'build.sh', true)}
          {ink('magenta', 'logo.png')}
          {ink('brightRed', 'site.tgz', true)}
          {ink('cyan', 'latest')}
          <span>README.md</span>
        </div>
        {prompt(
          <>
            <span style={{ background: colors.selectionBackground }}>echo "selected text"</span>
            <span
              className="ml-px inline-block h-[1.2em] w-[0.6em] translate-y-[0.2em]"
              style={{ background: colors.cursor }}
            />
          </>,
        )}
      </div>
    </div>
  );
}
