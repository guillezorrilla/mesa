// Feedback from inside Mesa, opened as an issue in a private repo (ADR-0025).
import type { Env, Upstream } from './broker.js';

/** The private repo feedback lands in, unless the Worker's FEEDBACK_REPO names another. */
export const DEFAULT_FEEDBACK_REPO = 'guillezorrilla/mesa-feedback';
/** Core's FEEDBACK_MAX: the broker cannot import core, so the two are kept equal by hand. */
const MESSAGE_MAX = 5000;
const FIELD_MAX = 40;
const TITLE_MAX = 70;

const field = (f: unknown): f is string =>
  typeof f === 'string' && f !== '' && f.length <= FIELD_MAX;

/** The feedback request's fields, or undefined when one is missing, empty, or too long. */
function parse(body: unknown) {
  if (typeof body !== 'object' || body === null) return undefined;
  const { message, version, build, from } = body as Record<string, unknown>;
  if (typeof message !== 'string' || !field(version) || !field(build) || !field(from))
    return undefined;
  const text = message.trim();
  if (!text || text.length > MESSAGE_MAX) return undefined;
  return { text, version, build, from };
}

/**
 * Opens one GitHub issue from a person's feedback with the broker's token, and answers only
 * whether it did: never the issue's number or URL, and nothing is kept or logged.
 */
export async function feedback(
  body: unknown,
  env: Env,
  upstream: Upstream,
): Promise<[status: number, body: unknown]> {
  const sent = parse(body);
  if (!sent) return [400, { error: 'bad_request' }];
  const token = env.FEEDBACK_GITHUB_TOKEN;
  if (!token) return [500, { error: 'not_configured' }];
  const repo = env.FEEDBACK_REPO || DEFAULT_FEEDBACK_REPO;
  const title = (sent.text.split('\n')[0] ?? '').trim().slice(0, TITLE_MAX);
  const answer = await upstream(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'mesa-broker',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({
      title,
      body: `${sent.text}\n\n---\nMesa ${sent.version} (build ${sent.build}), from ${sent.from}`,
    }),
  }).catch(() => undefined);
  return answer?.ok ? [201, {}] : [502, { error: 'upstream_failed' }];
}
