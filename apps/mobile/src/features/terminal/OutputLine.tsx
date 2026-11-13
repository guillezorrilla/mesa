import type { TerminalColors } from '@mesa/core/phone';
import { Text } from '@/components/ui/text';
import type { AnsiLine } from './ansi';
import { ansiTextStyle } from './ansiStyle';

/** One output line in mono, each run in its colours and styles, wrapped to the phone's width; long-press selects it to copy. */
export function OutputLine({ line, palette }: { line: AnsiLine; palette: TerminalColors }) {
  return (
    <Text
      selectable
      style={{ color: palette.foreground }}
      className="font-mono text-[13px] leading-[19px]"
    >
      {line.spans.map((span, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a line's runs never move.
        <Text key={at} style={ansiTextStyle(span, palette)}>
          {span.text}
        </Text>
      ))}
    </Text>
  );
}
