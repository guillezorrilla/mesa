/** How a slash command is typed: a Codex skill already carries its `$`, the rest take a slash. */
export const invocation = (name: string) => (name.startsWith('$') ? name : `/${name}`);
