// The slash commands a transcript records: Claude Code writes a command the person ran as a user
// message of tags (`<command-name>/model</command-name>` with its `<command-args>`), and what it
// printed as the next one (`<local-command-stdout>`, `<local-command-stderr>`), its colours kept.

/** A transcript's command entry: the command as typed (`/model sonnet`), or what it printed. */
export type CommandEntry = { command: string } | { output: string; error?: true };

const tag = (text: string, name: string) =>
  text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1];

/** The command entry user message `text` holds, none when it holds none (one starts with a tag). */
export function commandOf(text: string): CommandEntry | undefined {
  if (!text.trimStart().startsWith('<')) return undefined;
  const name = tag(text, 'command-name')?.trim();
  if (name) return { command: [name, tag(text, 'command-args')?.trim()].filter(Boolean).join(' ') };
  const stdout = tag(text, 'local-command-stdout');
  if (stdout !== undefined) return { output: stdout.trim() };
  const stderr = tag(text, 'local-command-stderr');
  if (stderr !== undefined) return { output: stderr.trim(), error: true };
  return undefined;
}
