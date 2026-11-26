import { SEVERITIES, severityRank } from './cloud-entry.js';

// A Logging filter in Cloud Monitoring's terms (CONTEXT.md, Cloud Logs), for the
// log_entry_count metric: what that metric carries maps, its severity, its resource type and every
// resource label (cluster, namespace, container, service, module, project), compared with =, !=,
// a regex (=~, !~) or has (:), joined by AND, OR, NOT and parentheses. Anything else (text, a
// payload field, a log) has no Monitoring term, and the result names the first such term.

const TOKENS = /\(|\)|"(?:[^"\\]|\\.)*"|>=|<=|!=|=~|[=<>:]|[^\s()"=<>:!~]+/g;

/** Severities at or past `severity` in the `op` direction. */
function severitiesFor(op: string, severity: string) {
  const rank = severityRank(severity);
  if (rank >= SEVERITIES.length) return undefined;
  const pick = {
    '=': (r: number) => r === rank,
    '>=': (r: number) => r <= rank,
    '>': (r: number) => r < rank,
    '<=': (r: number) => r >= rank,
    '<': (r: number) => r > rank,
  }[op];
  return pick ? SEVERITIES.filter((_, at) => pick(at)) : undefined;
}

const oneOf = (values: readonly string[]) =>
  values.length === 1 ? (values[0] as string) : `one_of(${values.join(', ')})`;

/** A Logging regex (a match anywhere) as Monitoring's, which must match the whole value. */
const fullMatch = (raw: string) =>
  `monitoring.regex.full_match(${JSON.stringify(`.*(?:${JSON.parse(raw) as string}).*`)})`;

/**
 * `filter` as a Cloud Monitoring filter on log_entry_count, or the first term that cannot be one
 * (`unmapped`, such as `jsonPayload.company`).
 */
export function monitoringFilter(filter: string): { filter: string } | { unmapped: string } {
  const tokens = filter.match(TOKENS) ?? [];
  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++];
  const fail = (term = 'the filter'): never => {
    throw new Unmapped(term);
  };
  /** A value, or several in parentheses joined by OR: each quoted as Monitoring wants. */
  const values = (): string[] => {
    if (peek() === '(') {
      take();
      const all = [...values()];
      while (peek() === 'OR') {
        take();
        all.push(...values());
      }
      if (take() !== ')') fail();
      return all;
    }
    const raw = take() ?? fail();
    if ('()'.includes(raw)) fail();
    return [raw.startsWith('"') ? raw : JSON.stringify(raw)];
  };
  const comparison = (): string => {
    const field = take() ?? fail();
    // A bare word or quoted text is Logging's search anywhere, which no metric label holds.
    if (!['=', '!=', '=~', '!~', ':', '>=', '<=', '>', '<'].includes(peek() ?? ''))
      fail(field.startsWith('"') ? `the text ${field}` : field);
    const op = take() ?? '';
    if (field === 'severity') {
      const picked = values().map((v) => JSON.parse(v) as string);
      const sets = picked.map((s) => severitiesFor(op, s.toUpperCase()));
      if (sets.some((s) => !s)) fail();
      const all = [...new Set(sets.flat())].map((s) => JSON.stringify(s));
      return `metric.labels.severity = ${oneOf(all)}`;
    }
    if (!/^resource\.(type|labels\.[\w-]+)$/.test(field)) fail(field);
    const picked = values();
    const negate = op.startsWith('!') ? 'NOT ' : '';
    if (op === '=~' || op === '!~') {
      if (picked.length !== 1) fail(field);
      return `${negate}${field} = ${fullMatch(picked[0] as string)}`;
    }
    if (op === ':') return `${field} = ${oneOf(picked.map((v) => `has_substring(${v})`))}`;
    if (op !== '=' && op !== '!=') fail(field);
    return `${negate}${field} = ${oneOf(picked)}`;
  };
  const term = (): string => {
    if (peek() === 'NOT' || peek() === '-') {
      take();
      return `NOT ${term()}`;
    }
    if (peek() === '(') {
      take();
      const inner = expression();
      if (take() !== ')') fail();
      return `(${inner})`;
    }
    return comparison();
  };
  const expression = (): string => {
    let out = term();
    while (at < tokens.length && peek() !== ')') {
      const op = peek() === 'OR' ? 'OR' : 'AND';
      if (peek() === 'AND' || peek() === 'OR') take();
      out = `${out} ${op} ${term()}`;
    }
    return out;
  };
  try {
    const out = tokens.length ? expression() : '';
    return at === tokens.length ? { filter: out } : { unmapped: 'the filter' };
  } catch (error) {
    if (error instanceof Unmapped) return { unmapped: error.term };
    throw error;
  }
}

/** A term with no Cloud Monitoring meaning. */
class Unmapped extends Error {
  constructor(readonly term: string) {
    super(term);
  }
}
