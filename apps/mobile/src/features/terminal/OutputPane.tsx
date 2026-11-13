import { TerminalOutput } from './TerminalOutput';

/**
 * An agent session's output in place of its conversation, as orca keeps its terminal apart from
 * the chat: its window as its terminal draws it, streamed while shown.
 */
export function OutputPane({ id }: { id: string }) {
  return <TerminalOutput id={id} agent />;
}
