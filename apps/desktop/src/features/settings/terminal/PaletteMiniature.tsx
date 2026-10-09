import { TERMINAL_COLOR_GROUPS, type TerminalColors } from '@mesa/core/browser';
import type { CSSProperties } from 'react';

/** A palette in miniature: a prompt and a listing in its colors over its ANSI strip. */
export function PaletteMiniature(props: { colors: TerminalColors; style?: CSSProperties }) {
  const { colors } = props;
  return (
    <div
      className="absolute inset-0 flex flex-col font-mono text-[10px] leading-[1.35]"
      style={{ background: colors.background, color: colors.foreground, ...props.style }}
    >
      <div className="flex-1 px-2 pt-1.5">
        <div>
          <span style={{ color: colors.green }}>❯</span> ls
        </div>
        <div>
          <span style={{ color: colors.blue }}>src/</span>{' '}
          <span style={{ color: colors.green }}>run.sh</span>{' '}
          <span style={{ color: colors.magenta }}>logo</span>{' '}
          <span
            className="inline-block h-[1.1em] w-[0.6em] translate-y-[0.15em]"
            style={{ background: colors.cursor }}
          />
        </div>
      </div>
      <div className="flex h-1.5">
        {TERMINAL_COLOR_GROUPS.normal.map((key) => (
          <span key={key} className="flex-1" style={{ background: colors[key] }} />
        ))}
      </div>
    </div>
  );
}
