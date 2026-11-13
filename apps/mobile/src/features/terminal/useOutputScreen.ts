import { terminalPalette } from '@mesa/core/phone';
import { useColorScheme } from 'react-native';
import { useTailFollow } from '../sessions/useTailFollow';
import { type AnsiLine, ansiLines } from './ansi';
import { withoutChrome } from './screenChrome';
import { useTerminalOutput } from './useTerminalOutput';

/**
 * The output screen of session `id` (useTerminalOutput): its lines as coloured runs, an agent's
 * (`agent`) without its screen chrome, in the terminal palette for the phone's appearance (Mesa
 * Dark or Light, as the desktop's terminals follow the interface), kept on the newest line until
 * the person scrolls up (useTailFollow), when they hold still; the top asks for older lines.
 */
export function useOutputScreen(id: string, first: string[], pushed: boolean, agent: boolean) {
  const output = useTerminalOutput(id, first, pushed);
  const parsed = ansiLines(output.lines);
  const lines = agent ? withoutChrome(parsed, (line) => line.text) : parsed;
  // Counted from the newest, so a line keeps its key as older pages arrive above it.
  const keys = lines.map((_, at) => String(lines.length - at));
  const tail = useTailFollow<AnsiLine>(keys, () => output.more && output.older());
  if (tail.away !== output.held) output.hold(tail.away);
  return {
    lines,
    keys,
    tail,
    palette: terminalPalette({ theme: 'follow' }, useColorScheme() === 'dark'),
    loading: output.loading,
    more: output.more,
  };
}
