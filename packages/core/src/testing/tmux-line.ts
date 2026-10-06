/**
 * One `list-windows` line in Mesa's format (sessions/tmux/format.ts), as tmux prints it: a live
 * claude on pid 4242 in `/src/<project>` unless told otherwise.
 */
export function tmuxLine(w: {
  project: string;
  window: string;
  index?: number;
  pid?: number;
  command?: string;
  path?: string;
  dead?: boolean;
  status?: number;
  signal?: string;
}): string {
  return [
    w.project,
    w.index ?? 0,
    w.window,
    w.pid ?? 4242,
    w.command ?? '2.1.282',
    w.path ?? `/src/${w.project}`,
    1790359178,
    w.dead ? 1 : 0,
    w.status ?? '',
    w.signal ?? '',
  ].join('\t');
}
