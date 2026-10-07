import type { MesaDeps } from '../context.js';
import { SYSTEM_ONE_MODELS, type SystemOneProvider } from '../decisions/systemone.js';
import type { Http } from '../lib/http.js';
import { type FakeRequest, fakeHttp } from './http.js';
import { memorySecretStore } from './secrets.js';

/** The invented Cloudflare account ID CLEF answers at in systemOneWorld. */
export const TEST_CLOUDFLARE_ACCOUNT = 'acct-0001';

const URLS: Record<SystemOneProvider, string> = {
  jev: 'https://api.typesafe.ai/v1/systemone',
  clef: `https://api.cloudflare.com/client/v4/accounts/${TEST_CLOUDFLARE_ACCOUNT}/ai/run/@cf/cloudflare/${SYSTEM_ONE_MODELS.clef}`,
};

/**
 * How the fake leans: a Choice to `option` when it has it (else its first) with probability `p`,
 * a Noul to P(true) `p`.
 */
export type Lean = { option?: string; p: number };
const DEFAULT_LEAN: Lean = { p: 0.8 };

/** `p` on `pick` of `keys`, the rest shared evenly (to 9 places), keyed as the wire keys them. */
const leaning = (keys: string[], pick: string, p: number) => {
  const rest = Math.round(((1 - p) / (keys.length - 1)) * 1e9) / 1e9;
  return Object.fromEntries(keys.map((k) => [k, k === pick ? p : rest]));
};

/** A System One answer to one wire question, leaning as told. */
function wireAnswer(q: { type: string; criteria?: unknown }, lean: Lean) {
  if (q.type === 'noul') return { type: 'noul', noul: lean === DEFAULT_LEAN ? 0.9 : lean.p };
  if (q.type === 'choice') {
    const names = Object.keys(q.criteria as Record<string, unknown>);
    const pick = lean.option && names.includes(lean.option) ? lean.option : (names[0] as string);
    return {
      type: 'choice',
      choice: pick,
      probabilities: leaning(names, pick, lean.p),
      confidence: lean.p,
    };
  }
  const levels = (q.criteria as unknown[]).map((_, i) => String(i));
  const probabilities = leaning(levels, '0', lean.p);
  const score = levels.reduce((sum, l) => sum + Number(l) * (probabilities[l] ?? 0), 0);
  return { type: 'score', score, probabilities, confidence: lean.p };
}

/**
 * Jev and CLEF in memory (CLEF at TEST_CLOUDFLARE_ACCOUNT), and an empty Keychain: each answers
 * whatever System One body it is sent, leaning to the first option or level (0.8; a Noul 0.9), with
 * the model id it was asked for and 100 input tokens. `lean` steers the answers, `refuse` makes
 * one answer an HTTP status instead, and `stall` holds its requests until their deadline.
 */
export function systemOneWorld() {
  const refused: Partial<Record<SystemOneProvider, number>> = {};
  const stalled = new Set<string>();
  let lean = DEFAULT_LEAN;
  const answer = (provider: SystemOneProvider) => (request: FakeRequest) => {
    const status = refused[provider];
    if (status) return { status, body: { error: 'refused' } };
    const body = JSON.parse(request.body ?? '{}');
    const answers = Object.fromEntries(
      Object.entries(body.questions as Record<string, { type: string }>).map(([id, q]) => [
        id,
        wireAnswer(q, lean),
      ]),
    );
    const result = { model: body.model, answers, usage: { input_tokens: 100 } };
    return {
      body: provider === 'clef' ? { success: true, errors: [], messages: [], result } : result,
    };
  };
  const web = fakeHttp({
    [`POST ${URLS.jev}`]: answer('jev'),
    [`POST ${URLS.clef}`]: answer('clef'),
  });
  const secrets = memorySecretStore();
  // A stalled provider's request ends only when its signal aborts (the deadline, or a cancel).
  const http: Http = (url, init) => {
    if (!stalled.has(url)) return web.http(url, init);
    web.requests.push({ method: init?.method ?? 'GET', url, headers: {} });
    return new Promise((_, reject) => {
      const signal = init?.signal;
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  const deps = { http, secretStore: secrets.store } satisfies Partial<MesaDeps>;
  return {
    ...web,
    http,
    secrets,
    deps,
    urls: URLS,
    /** Every answer from now on leans as told; none puts the default lean back. */
    lean: (next?: Lean) => {
      lean = next ?? DEFAULT_LEAN;
    },
    /** `provider` holds every request until its deadline from now on, or answers again with false. */
    stall: (provider: SystemOneProvider, on = true) => {
      if (on) stalled.add(URLS[provider]);
      else stalled.delete(URLS[provider]);
    },
    /** `provider` answers HTTP `status` from now on; none puts it back. */
    refuse: (provider: SystemOneProvider, status?: number) => {
      if (status === undefined) delete refused[provider];
      else refused[provider] = status;
    },
  };
}
