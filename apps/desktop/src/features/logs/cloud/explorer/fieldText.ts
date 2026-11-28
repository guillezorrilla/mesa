// How the fields pane fits a long value in a narrow row, keeping what identifies it.

const ELLIPSIS = String.fromCharCode(0x2026);

/**
 * `value` in at most `max` characters: a dotted name (a Java logger) keeps its last segments
 * (`...webhook.domain.TideWebhookService`), any other value (a service, an id) its start and end
 * around an ellipsis (`harbour-we...rope-beta`).
 */
export function shortValue(value: string, max: number) {
  if (value.length <= max) return value;
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
