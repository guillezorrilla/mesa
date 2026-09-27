import { MesaError } from '../lib/result.js';

const MARKER = '<!-- keep -->';

/** Replaces generated text while retaining every paired user block in its original order. */
export function keepSections(generated: string, previous: string, path: string): string {
  const markers = [...previous.matchAll(/<!--\s*\/?keep\b/g)];
  if (markers.some((match) => !previous.startsWith(MARKER, match.index))) {
    throw new MesaError('invalid_config', `${path} has an invalid keep marker; use ${MARKER}`);
  }
  if (markers.length % 2 !== 0) {
    throw new MesaError('invalid_config', `${path} has an unmatched ${MARKER} marker`);
  }
  if (/<!--\s*\/?keep\b/.test(generated)) {
    throw new MesaError('invalid_config', 'agent output contains a keep marker');
  }
  const blocks: string[] = [];
  for (let i = 0; i < markers.length; i += 2) {
    const start = markers[i]?.index;
    const end = markers[i + 1]?.index;
    if (start === undefined || end === undefined) continue;
    blocks.push(previous.slice(start, end + MARKER.length));
  }
  return `${[generated.trim(), ...blocks].join('\n\n')}\n`;
}
