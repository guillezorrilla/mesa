// Which Mac each session (or decision gate) the phone has seen lives on, so a screen pushed by id
// alone (a session's changes, a gate, a session the Inbox opens) talks to that Mac.
// ponytail: one map for the app's life, never pruned; ids are a few bytes each.
const owners = new Map<string, string>();
/** The Mac the last scoped screen talked to: one pushed from it, by an id not seen yet, is there too. */
let scoped: string | undefined;

/** Notes that `ids` came from the Mac paired as `mac`. */
export function rememberMac(mac: string, ids: readonly string[]) {
  for (const id of ids) owners.set(id, mac);
}

/**
 * The Mac a screen's route names: `mac` (a push names its pairing), else the Mac its `id` was
 * seen on, else the Mac of the screen it was pushed from (a session a fork just started); the id
 * is then known to be there. A screen with neither (New session, the Agents list) gets
 * undefined: the first Mac.
 */
export function macFor(params: { mac?: string; id?: string } | undefined): string | undefined {
  const id = params?.id;
  const mac = params?.mac ?? (id ? (owners.get(id) ?? scoped) : undefined);
  if (!mac) return undefined;
  scoped = mac;
  if (id) owners.set(id, mac);
  return mac;
}
