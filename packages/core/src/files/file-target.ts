// A place in a file as a person or a terminal writes it: `path`, `path:line`, or
// `path:line:column` (the column is dropped). Pure, so the app bundles it (`@mesa/core/browser`).

/** The path and line `target` names (no line when it names none); undefined without a path. */
export function parseFileTarget(target: string): { path: string; line?: number } | undefined {
  const match = /^(.*?)(?::([1-9]\d*)(?::\d+)?)?$/.exec(target.trim());
  if (!match?.[1]) return undefined;
  return { path: match[1], line: match[2] ? Number(match[2]) : undefined };
}
