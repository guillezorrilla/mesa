import { shellWord } from '../../lib/process.js';

// The command lines tmux runs back into this mesa: its pane-died hook, and work run later.

/** A word the shell reads as itself, left bare; any other is single-quoted. */
const word = (w: string) => (/^[\w-]+$/.test(w) ? w : shellWord(w));

/**
 * `mesa --profile <profile> <args>` for tmux to run through the shell: this mesa's words and the
 * profile single-quoted, an argument only when it needs it, and a `#` doubled for tmux's formats.
 */
export const mesaCommand = (self: readonly string[], profile: string, args: readonly string[]) =>
  [...self.map(shellWord), '--profile', shellWord(profile), ...args.map(word)]
    .join(' ')
    .replaceAll('#', '##');

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
  const mesa = mesaCommand(self, profile, ['hook', 'tmux', 'pane-died', '--']);
  const command = `${mesa} #{q:session_name} #{q:window_name} >/dev/null 2>&1 || :`;
  return `run-shell -b "${command.replace(/[\\"$]/g, (c) => `\\${c}`)}"`;
}
