import type { ReactNode } from 'react';
import { View } from 'react-native';
import { JumpButton } from '../sessions/JumpButton';
import { TerminalPage } from './TerminalPage';
import { useTerminalStream } from './useTerminalStream';

/**
 * A session's output as orca's terminal: xterm in a page, the window's own screen in its colours
 * at the phone's width, following the newest line until the person scrolls up, when a button
 * jumps back. One screen for a terminal session (`header` above it) and an agent's output
 * (`agent`).
 */
export function TerminalOutput({
  id,
  agent = false,
  header,
}: {
  id: string;
  agent?: boolean;
  header?: ReactNode;
}) {
  const terminal = useTerminalStream(id, agent);
  return (
    <View className="flex-1 bg-background">
      {header ? <View className="gap-3 px-4 pt-3 pb-2">{header}</View> : null}
      <View className="flex-1">
        <TerminalPage ref={terminal.page} onMessage={terminal.onMessage} />
        {terminal.away ? <JumpButton fresh={0} onPress={terminal.jump} /> : null}
      </View>
    </View>
  );
}
