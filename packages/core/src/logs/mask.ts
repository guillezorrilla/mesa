// What Ask sends to the model has emails and IP addresses masked (CONTEXT.md, Ask (logs)), unless
// the profile's logs.mask is off.

import type { CloudErrorGroup } from './errors.js';
import type { CloudLogEntry } from './gcp.js';

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

/** `group` with everything it carries from the logs masked: id, message, sample, services, samples. */
export const maskGroup = (group: CloudErrorGroup): CloudErrorGroup => ({
  ...group,
  id: maskText(group.id),
  message: maskText(group.message),
  sample: maskText(group.sample),
  services: group.services.map(maskText),
  ...(group.samples ? { samples: group.samples.map(maskEntry) } : {}),
});
