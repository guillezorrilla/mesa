import type { MesaDeps } from '../context.js';
import type { SystemOneProvider } from '../decisions/systemone.js';
import { type FakeRequest, fakeHttp } from './http.js';
import { memorySecretStore } from './secrets.js';

/** The invented Cloudflare account ID CLEF answers at in systemOneWorld. */
export const TEST_CLOUDFLARE_ACCOUNT = 'acct-0001';

const URLS: Record<SystemOneProvider, string> = {
  jev: 'https://api.typesafe.ai/v1/systemone',
  clef: `https://api.cloudflare.com/client/v4/accounts/${TEST_CLOUDFLARE_ACCOUNT}/ai/run/@cf/cloudflare/clef-flash`,
};

/** 0.8 on the first of `n` names, the rest shared evenly, keyed as the wire keys them. */
const leaning = (keys: string[]) =>
  Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 0.8 : 0.2 / (keys.length - 1)]));

/** A System One answer to one wire question, leaning to its first option or level. */
function wireAnswer(q: { type: string; criteria?: unknown }) {
  if (q.type === 'noul') return { type: 'noul', noul: 0.9 };
  if (q.type === 'choice') {
    const names = Object.keys(q.criteria as Record<string, unknown>);
    return { type: 'choice', choice: names[0], probabilities: leaning(names), confidence: 0.8 };
  }
  const levels = (q.criteria as unknown[]).map((_, i) => String(i));
  const probabilities = leaning(levels);
  const score = levels.reduce((sum, l) => sum + Number(l) * (probabilities[l] ?? 0), 0);
  return { type: 'score', score, probabilities, confidence: 0.8 };
}

/**
 * Jev and CLEF in memory (CLEF at TEST_CLOUDFLARE_ACCOUNT), and an empty Keychain: each answers
 * whatever System One body it is sent, leaning to the first option or level, with the model id it
 * was asked for and 100 input tokens; `refuse` makes one answer an HTTP status instead.
 */
export function systemOneWorld() {
  const refused: Partial<Record<SystemOneProvider, number>> = {};
  const answer = (provider: SystemOneProvider) => (request: FakeRequest) => {
    const status = refused[provider];
    if (status) return { status, body: { error: 'refused' } };
    const body = JSON.parse(request.body ?? '{}');
    const answers = Object.fromEntries(
      Object.entries(body.questions as Record<string, { type: string }>).map(([id, q]) => [
        id,
        wireAnswer(q),
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
  const deps = { http: web.http, secretStore: secrets.store } satisfies Partial<MesaDeps>;
  return {
    ...web,
    secrets,
    deps,
    urls: URLS,
    /** `provider` answers HTTP `status` from now on; none puts it back. */
    refuse: (provider: SystemOneProvider, status?: number) => {
      if (status === undefined) delete refused[provider];
      else refused[provider] = status;
    },
  };
}
