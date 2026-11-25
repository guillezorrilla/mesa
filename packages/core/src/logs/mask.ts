// What Ask sends to the model has emails and IP addresses masked (CONTEXT.md, Ask (logs)), unless
// the profile's logs.mask is off.

import type { CloudErrorGroup } from './errors.js';
import type { CloudLogEntry } from './gcp.js';
import type { Incident } from './incidents.js';

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6 = /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi;

/** `text` with each email as `<email>` and each IP address as `<ip>`. */
export const maskText = (text: string) =>
  text.replace(EMAIL, '<email>').replace(IPV6, '<ip>').replace(IPV4, '<ip>');

/** `entry` with its service, message and context fields masked (maskText). */
export const maskEntry = (entry: CloudLogEntry): CloudLogEntry => ({
  ...entry,
  service: entry.service && maskText(entry.service),
  message: maskText(entry.message),
  fields: Object.fromEntries(Object.entries(entry.fields).map(([k, v]) => [k, maskText(v)])),
});

/** `group` with everything it carries from the logs masked: id, message, sample, services, samples, variants, facets. */
export const maskGroup = (group: CloudErrorGroup): CloudErrorGroup => ({
  ...group,
  id: maskText(group.id),
  message: maskText(group.message),
  sample: maskText(group.sample),
  services: group.services.map(maskText),
  ...(group.samples ? { samples: group.samples.map(maskEntry) } : {}),
  ...(group.variants
    ? { variants: group.variants.map((v) => ({ ...v, message: maskText(v.message) })) }
    : {}),
  ...(group.facets
    ? {
        facets: group.facets.map((f) => ({
          ...f,
          values: f.values.map((v) => ({ ...v, value: maskText(v.value) })),
        })),
      }
    : {}),
});

/** `incident` with its group keys and its links' details masked. */
export const maskIncident = (incident: Incident): Incident => ({
  ...incident,
  id: maskText(incident.id),
  origin: maskText(incident.origin),
  groups: incident.groups.map(maskText),
  services: incident.services.map(maskText),
  links: incident.links.map((l) => ({
    ...l,
    from: maskText(l.from),
    to: maskText(l.to),
    detail: maskText(l.detail),
  })),
});

/** What Errors gives an agent, masked: every group and every incident. */
export const maskErrors = <T extends { groups: CloudErrorGroup[]; incidents: Incident[] }>(
  found: T,
): T => ({
  ...found,
  groups: found.groups.map(maskGroup),
  incidents: found.incidents.map(maskIncident),
});
