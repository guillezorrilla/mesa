import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { setConfigValue } from '../profile/config.js';
import { decisionKeys, KEY_OF, type KeyRow, keyProvider, MODEL_OF } from './keys.js';
import { SYSTEM_ONE_MODELS, type SystemOneProvider, systemOneBackend } from './systemone.js';
import { type Backend, type DecisionsModel, DecisionsModelSchema, type Question } from './types.js';

/** The deadline of a call a person asked for and waits on, as `mesa decide` (ADR-0019: 10 s). */
export const ON_DEMAND_MS = 10_000;
/**
 * The deadline of a call made beside a turn or a Board read, which no one waits on (ADR-0019:
 * 1,500 ms per turn, measured at p95).
 */
export const PER_TURN_MS = 1_500;

// The one invented question a key's test asks, so a saved key is known to answer.
const TEST_STATE =
  'A coding agent finished its turn: the tests pass and it waits for the next instruction.';
const TEST_QUESTIONS: Question[] = [
  {
    kind: 'Choice',
    id: 'state',
    options: ['working', 'idle'],
    instructions: 'Which state is this coding agent session in?',
  },
];

const other = (model: SystemOneProvider): SystemOneProvider => (model === 'jev' ? 'clef' : 'jev');

/**
 * The model once `saved`'s key is saved: the first key selects its model, and so does the key of
 * a model chosen while the chosen one has none; otherwise the person's choice stands, `none` too.
 */
const modelAfterSave = (active: DecisionsModel, saved: SystemOneProvider, otherSet: boolean) =>
  active === saved || otherSet ? active : saved;

/** The model once `removed`'s key is gone: the other model if it has a key, else none. */
const modelAfterRemove = (
  active: DecisionsModel,
  removed: SystemOneProvider,
  otherSet: boolean,
): DecisionsModel => (active !== removed ? active : otherSet ? other(removed) : 'none');

/**
 * The profile's hosted decision models (#488): their keys in the Keychain, the one Faro asks
 * (`decisions.model`), and that one as a backend. No key, no model: the rules answer alone.
 */
export function decisionModels(ctx: MesaContext) {
  const keys = decisionKeys(ctx.secretStore, ctx.profile);
  const settings = () => ctx.open().config.decisions;
  // A JSON string is YAML that stays a string, whatever it looks like (an all-digit account ID).
  const setConfig = (dotted: string, value: string) =>
    setConfigValue(ctx.paths.config, dotted, JSON.stringify(value), ctx);
  const hasKey = async (model: SystemOneProvider) => (await keys.read(KEY_OF[model])) !== undefined;
  /** `model` over `key`, at the model id its thresholds were fitted on (SYSTEM_ONE_MODELS). */
  const backendOf = (
    model: SystemOneProvider,
    key: string,
    deadlineMs: number,
    accountId: string | undefined,
  ) =>
    systemOneBackend({
      provider: model,
      http: ctx.http,
      key,
      model: SYSTEM_ONE_MODELS[model],
      deadlineMs,
      ...(model === 'clef' && accountId ? { accountId } : {}),
    });
  const row = async (provider: KeyRow['provider']) =>
    (await keys.list()).find((r) => r.provider === provider) as KeyRow;

  return {
    /** Whether `model`'s key is in the Keychain. */
    hasKey,
    keys: {
      /** Each provider's key as `{ provider, set, addedAt, last4 }`: never the key. */
      list: () => {
        ctx.open();
        return keys.list();
      },
      /**
       * Tests `value` with one call that asks an invented question, then keeps it in the Keychain
       * and selects its model when no other is chosen with a key. A Cloudflare token needs the
       * account ID, given once and kept in config.yaml. A failed test saves nothing.
       */
      set: async (input: string, value: string, options: { account?: string } = {}) => {
        const provider = keyProvider(input);
        const model = MODEL_OF[provider];
        const before = settings();
        const key = value.trim();
        if (!key) throw new MesaError('usage', 'no key given: type it at the prompt or pipe it in');
        const account = options.account?.trim() || undefined;
        if (account && provider !== 'cloudflare')
          throw new MesaError('usage', '--account goes with a cloudflare token only');
        const accountId = account ?? before.cloudflareAccount;
        if (provider === 'cloudflare' && !accountId)
          throw new MesaError('usage', 'a Cloudflare token needs its account ID: --account <id>');
        try {
          await backendOf(model, key, ON_DEMAND_MS, accountId).answer(TEST_STATE, TEST_QUESTIONS);
        } catch (error) {
          // systemOneBackend's errors name the provider, never the key.
          const failed = error instanceof MesaError ? error : new MesaError('internal', `${error}`);
          throw new MesaError(failed.code, `${failed.message}; the key was not saved`);
        }
        await keys.write(provider, key, ctx.clock().toISOString());
        if (account && account !== before.cloudflareAccount)
          setConfig('decisions.cloudflareAccount', account);
        const next = modelAfterSave(before.model, model, await hasKey(other(model)));
        if (next !== before.model) setConfig('decisions.model', next);
        return { key: await row(provider), model: next };
      },
      /** Deletes the key; when its model was the one chosen, the other takes over if it has a key. */
      remove: async (input: string) => {
        const provider = keyProvider(input);
        const model = MODEL_OF[provider];
        const before = settings().model;
        const removed = await keys.remove(provider);
        const next = modelAfterRemove(before, model, await hasKey(other(model)));
        if (next !== before) setConfig('decisions.model', next);
        return { provider, removed, model: next };
      },
    },
    /** Chooses the model Faro asks: `none`, or one whose key is set. */
    use: async (input: string) => {
      const parsed = DecisionsModelSchema.safeParse(input);
      if (!parsed.success)
        throw new MesaError(
          'usage',
          `unknown model ${input}; one of ${DecisionsModelSchema.options.join(', ')}`,
        );
      const model = parsed.data;
      ctx.open();
      if (model !== 'none' && !(await hasKey(model)))
        throw new MesaError(
          'usage',
          `${model} has no key: run mesa decisions key set ${KEY_OF[model]}`,
        );
      return { model, changed: setConfig('decisions.model', model).changed };
    },
    /**
     * The chosen model as a backend that reads its key when asked, so a removed key is never
     * sent; none with `model: none`. A missing key or account ID throws, and the rules answer.
     */
    active: (deadlineMs: number): Backend | undefined => {
      const decisions = ctx.configIfAny()?.decisions;
      const model = decisions?.model ?? 'none';
      if (model === 'none') return undefined;
      return {
        name: model,
        answer: async (state, questions, signal) => {
          const stored = await keys.read(KEY_OF[model]);
          if (!stored)
            throw new MesaError(
              'invalid_config',
              `no ${KEY_OF[model]} key: run mesa decisions key set ${KEY_OF[model]}`,
            );
          if (model === 'clef' && !decisions?.cloudflareAccount)
            throw new MesaError(
              'invalid_config',
              'no Cloudflare account ID: run mesa decisions key set cloudflare --account <id>',
            );
          return backendOf(model, stored.key, deadlineMs, decisions?.cloudflareAccount).answer(
            state,
            questions,
            signal,
          );
        },
      };
    },
  };
}

export type DecisionModels = ReturnType<typeof decisionModels>;
