// A query's own filters (CONTEXT.md, Ask (logs)): what an Ask's agent asked for itself, without the
// env, noise and time bounds a read adds; what Run and Save as view apply over the person's view.
// Pure, so the app bundles it.

/** The filters a person sets, which a query's own part holds. */
export const OWN_FILTERS = {
  filter: true,
  severity: true,
  text: true,
  fields: true,
  services: true,
  trace: true,
} as const;
type OwnKey = keyof typeof OWN_FILTERS;
const OWN_KEYS = Object.keys(OWN_FILTERS) as OwnKey[];
type Own = Partial<Record<OwnKey, unknown>>;

/** `query`'s own filters: those of OWN_FILTERS it sets. */
export const ownOf = <Q extends Own>(query: Q) =>
  Object.fromEntries(OWN_KEYS.flatMap((k) => (query[k] === undefined ? [] : [[k, query[k]]]))) as {
    [K in OwnKey & keyof Q]?: Q[K];
  };

/** `view` with its own filters replaced by `own`'s; its env, range and projects stay. */
export const withOwn = <V extends Own>(view: V, own: Partial<Pick<V, OwnKey>>): V => ({
  ...view,
  ...Object.fromEntries(OWN_KEYS.map((k) => [k, undefined])),
  ...own,
});
