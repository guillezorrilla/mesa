// How the fields pane fits a long value in a narrow row, keeping what identifies it.

const ELLIPSIS = String.fromCharCode(0x2026);

/**
 * `value` in at most `max` characters: a dotted name (a Java logger) keeps its last segments
 * (`...webhook.domain.TideWebhookService`), a service its suffix, any other value its start and
 * end around an ellipsis.
 */
export function shortValue(value: string, max: number, kind: 'service' | 'value' = 'value') {
  if (value.length <= max) return value;
  if (kind === 'service') return ELLIPSIS + value.slice(-(max - 1));
  if (/^[\w$]+(\.[\w$]+){2,}$/.test(value)) {
    const segments = value.split('.');
    let kept = segments.at(-1) ?? '';
    for (const segment of segments.slice(0, -1).reverse()) {
      if (kept.length + segment.length + 2 > max) break;
      kept = `${segment}.${kept}`;
    }
    return ELLIPSIS + (kept.length + 1 > max ? kept.slice(-(max - 1)) : kept);
  }
  const head = Math.ceil((max - 1) / 2);
  return value.slice(0, head) + ELLIPSIS + value.slice(value.length - (max - 1 - head));
}
