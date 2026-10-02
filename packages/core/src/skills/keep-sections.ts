import { MesaError } from '../lib/result.js';

/** The vault's mark for a block a rewrite leaves alone: one before it, one after. */
export const KEEP_MARKER = '<!-- keep -->';
const ANY_MARKER = /<!--\s*\/?keep\b/;

/**
 * The blocks between paired keep markers in `text`, markers included, in order. A malformed or
 * unmatched marker is invalid_config, naming `path`.
 */
export function keptBlocks(text: string, path: string): string[] {
  const markers = [...text.matchAll(new RegExp(ANY_MARKER, 'g'))];
  if (markers.some((match) => !text.startsWith(KEEP_MARKER, match.index))) {
    throw new MesaError('invalid_config', `${path} has an invalid keep marker; use ${KEEP_MARKER}`);
  }
  if (markers.length % 2 !== 0) {
    throw new MesaError('invalid_config', `${path} has an unmatched ${KEEP_MARKER} marker`);
  }
  const blocks: string[] = [];
  for (let i = 0; i < markers.length; i += 2) {
    const start = markers[i]?.index;
    const end = markers[i + 1]?.index;
    if (start === undefined || end === undefined) continue;
    blocks.push(text.slice(start, end + KEEP_MARKER.length));
  }
  return blocks;
}

/** Replaces generated text while retaining every paired user block in its original order. */
export function keepSections(generated: string, previous: string, path: string): string {
  const blocks = keptBlocks(previous, path);
  if (ANY_MARKER.test(generated)) {
    throw new MesaError('invalid_config', 'agent output contains a keep marker');
  }
  return `${[generated.trim(), ...blocks].join('\n\n')}\n`;
}

/**
 * `generated` holding exactly the keep blocks of `previous`, whatever the agent did with them: a
 * block it kept as it was stays where it is, one it dropped or changed is added at the end, and a
 * block of its own making is taken out. So the guarantee is core's, not the model's.
 */
export function restoreKept(generated: string, previous: string, path: string): string {
  const kept = keptBlocks(previous, path);
  let text = generated;
  for (const block of keptBlocks(generated, 'the agent output')) {
    if (!kept.includes(block)) text = text.replace(block, '').replace(/\n{3,}/g, '\n\n');
  }
  const dropped = kept.filter((block) => !text.includes(block));
  return `${[text.trim(), ...dropped].join('\n\n')}\n`;
}
