import type { Config } from '@mesa/core';
import { type TerminalColors, terminalPalette } from '@mesa/core/browser';
import { useMemo } from 'react';
import { ansiSpans } from '@/lib/ansiSpans';
import { useInterfaceDark } from '@/lib/useInterfaceDark';
import { cn } from '@/lib/utils';

/**
 * Terminal lines as a terminal draws them: monospace, in the profile's terminal colours
 * (`terminal`, else Mesa's for the interface theme), each line's own colours and weights kept
 * (ansiSpans), long lines scrolling sideways.
 */
export function AnsiLines(props: {
  lines: readonly string[];
  terminal?: Pick<Config['terminal'], 'theme' | 'colors'>;
  className?: string;
}) {
  const dark = useInterfaceDark();
  const { theme = 'follow', colors } = props.terminal ?? {};
  const palette: TerminalColors = useMemo(
    () => terminalPalette({ theme, colors }, dark),
    [theme, colors, dark],
  );
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-md p-3 font-mono text-xs leading-snug',
        props.className,
      )}
      style={{ background: palette.background, color: palette.foreground }}
    >
      {props.lines.map((line, row) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a frame's lines have no identity but their place.
        <div key={row} className="min-h-[1lh] whitespace-pre">
          {ansiSpans(line, palette).map((span, at) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: runs of one line, in order.
              key={at}
              className={cn(
                span.bold && 'font-bold',
                span.dim && 'opacity-60',
                span.italic && 'italic',
                span.underline && 'underline',
              )}
              style={{ color: span.color, background: span.background }}
            >
              {span.text}
            </span>
          ))}
        </div>
      ))}
    </pre>
  );
}
