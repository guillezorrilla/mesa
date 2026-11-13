import { TerminalOutput } from './TerminalOutput';

/**
 * An agent session's output in place of its conversation, as orca keeps its terminal apart from
 * the chat: what the agent printed, without its screen chrome, asked anew while shown.
 */
export function OutputPane({ id, first }: { id: string; first: string[] }) {
  // An agent's output log is never pushed (only a terminal's), so it is asked every second.
  return <TerminalOutput id={id} first={first} pushed={false} agent />;
}
