import { shellWord } from '../lib/process.js';

// `mesa logs run` (CONTEXT.md, Logs panel): any command's output kept for the Logs panel as it runs.

/**
 * The argv that runs `command` in a pseudo-terminal with `script(1)`, so its colours, input,
 * Ctrl-C and exit status are its own, while every byte is appended to `file`: util-linux's
 * `script -c` where `script --version` answers, else the BSD form macOS has. A stdin that is no
 * terminal is read as empty. The file is the person's alone (0600): a server's output may hold secrets.
 */
export function teeArgv(file: string, command: readonly string[]) {
  const line = command.map(shellWord).join(' ');
  return [
    'sh',
    '-c',
    // BSD script refuses a stdin that is no terminal (a pipe): it then reads none.
    'log=$1; line=$2; shift 2; umask 077; : >>"$log" && chmod 600 "$log"; [ -t 0 ] || exec </dev/null; if script --version >/dev/null 2>&1; then exec script -q -a -e -f -c "$line" "$log"; fi; exec script -q -a -F "$log" "$@"',
    'sh',
    file,
    line,
    ...command,
  ];
}
