import { serviceRefOf } from './cloud-entry.js';
import { REVISION_LABELS, SERVICE_LABELS, type ServiceConfig } from './filter-text.js';
import type { CloudLogEntry } from './gcp.js';

// The fields the Explorer's query bar suggests (CONTEXT.md, Cloud Logs): each by the name a Logging
// filter knows it by, with its values in the entries read, the most common first. Pure, so the app
// bundles it (`@mesa/core/browser`).

/** A field a filter can name, and its values in the entries read, the most common first. */
export type QueryField = { field: string; values: string[] };

/**
 * The fields `entries` carry by their real names, the most carried first: `severity`, the service
 * and revision labels of each service's kind (`kindOf` a `<project>/<name>`, GKE, Cloud Run or App
 * Engine; one of unknown kind is left out rather than named wrong), and `jsonPayload.<key>` for
 * the context fields.
 */
export function queryFields(
  entries: readonly CloudLogEntry[],
  kindOf: (ref: string) => string | undefined,
  config: ServiceConfig = {},
): QueryField[] {
  const counts = new Map<string, Map<string, number>>();
  const add = (field: string, value: string) => {
    const byValue = counts.get(field) ?? new Map<string, number>();
    byValue.set(value, (byValue.get(value) ?? 0) + 1);
    counts.set(field, byValue);
  };
  for (const entry of entries) {
    add('severity', entry.severity);
    const kind = kindOf(serviceRefOf(entry));
    const servicePath = config.service ?? SERVICE_LABELS.find(([, , name]) => name === kind)?.[0];
    if (entry.service && servicePath) add(servicePath, entry.service);
    for (const [key, value] of Object.entries(entry.fields)) {
      if (key !== 'revision') add(`jsonPayload.${key}`, value);
      else if (kind && REVISION_LABELS[kind]) add(REVISION_LABELS[kind], value);
    }
  }
  const total = (byValue: Map<string, number>) => [...byValue.values()].reduce((a, b) => a + b, 0);
  return [...counts]
    .sort((a, b) => total(b[1]) - total(a[1]))
    .map(([field, byValue]) => ({
      field,
      values: [...byValue].sort((a, b) => b[1] - a[1]).map(([value]) => value),
    }));
}
