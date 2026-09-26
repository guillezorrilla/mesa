import { shellWord } from '../../lib/process.js';

/**
 * The tmux command a pane-died hook runs: `mesa --profile <profile> hook tmux pane-died -- <project>
 * <window>`, the pane's names filled in, shell-quoted, by tmux when it fires (`#{q:...}`). Three
 * parsers read it. For the shell, this mesa's words are single-quoted. For tmux's formats, a `#`
 * in them is doubled. For tmux's double quotes, a backslash, a quote, and a `$` are escaped.
 * `-b`: tmux runs each hook in the background, so one slow hook never holds up the next pane's.
 * Its output and any failure are dropped: tmux shows a background command's output, or a
 * nonzero status, in view mode on some other pane, which would freeze a live agent's screen.
 */
export function paneDiedHook(self: readonly string[], profile: string): string {
  const mesa = [...self.map(shellWord), '--profile', shellWord(profile)].join(' ');
  const command = `${mesa.replaceAll('#', '##')} hook tmux pane-died -- #{q:session_name} #{q:window_name} >/dev/null 2>&1 || :`;
  return `run-shell -b "${command.replace(/[\\"$]/g, (c) => `\\${c}`)}"`;
}
