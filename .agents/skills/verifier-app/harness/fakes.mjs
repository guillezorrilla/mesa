// What the harness answers itself, by the command's words (without --json); undefined runs the
// real CLI. Fill it per check with invented data, the way GitHub, Jira or the OS would answer.
const ok = (data) => ({ ok: true, data });

export function fake(args) {
  // `browser external` runs /usr/bin/open, which would open a real tab: record it instead.
  if (args[0] === 'browser' && args[1] === 'external') return ok({ url: args.at(-1), opened: true });
  return undefined;
}
