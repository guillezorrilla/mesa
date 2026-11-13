// Which Mac each session (or decision gate) the phone has seen lives on, so a screen pushed by id
// alone (a session's changes, a gate, a session the Inbox opens) talks to that Mac.
// ponytail: one map for the app's life, never pruned; ids are a few bytes each.
const owners = new Map<string, string>();

/** Notes that `ids` came from the Mac paired as `mac`. */
export function rememberMac(mac: string, ids: readonly string[]) {
  for (const id of ids) owners.set(id, mac);
}

/** The Mac a session or gate came from, when the phone has seen it. */
export const macOf = (id: string | undefined) => (id ? owners.get(id) : undefined);
