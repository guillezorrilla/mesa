import type { GuardrailCheck } from '../../decisions/guardrail.js';
import { MesaError } from '../../lib/result.js';
import type { SavedPrompt } from '../../prompts/prompts.js';
import type { PhoneCall, PhoneRow } from '../protocol/rpc.js';
import { type SendResult, type SessionAction, STEER_METHODS } from '../protocol/steer.js';
import { waitsForTurn } from './deliver.js';
import type { PhoneQueue } from './queue.js';

/** Core's session functions a steering call goes through, as the phone (a person) calls them. */
export type SessionSteer = {
  /** `mesa send` as a person, the receipt naming the phone; `yes` past a guardrail ask. */
  send: (id: string, text: string, yes: boolean) => Promise<unknown>;
  /** `mesa type` as a person: a line typed into a plain terminal session, then Enter. */
  type: (id: string, text: string, yes: boolean) => Promise<unknown>;
  /** The guardrail's verdict on a reply to session `id`, recorded nowhere: it only routes it. */
  check: (id: string, text: string) => Promise<Pick<GuardrailCheck, 'verdict' | 'reason'>>;
  /** Keeps the photo (JPEG bytes) on the Mac and returns the prompt that sends it, with `note`. */
  image: (id: string, jpeg: Buffer, note: string) => string;
  /** Runs `action` on the session; returns the session a resume, fork or handoff started. */
  act: (id: string, action: SessionAction, text?: string) => Promise<string | undefined>;
  prompts: () => SavedPrompt[];
};
export type SteerDeps = SessionSteer & { queue: PhoneQueue };

type SteerCall = Extract<PhoneCall, { method: (typeof STEER_METHODS)[number] }>;

export const isSteerCall = (call: PhoneCall): call is SteerCall =>
  (STEER_METHODS as readonly string[]).includes(call.method);

/** The guardrail's ask or block, as the phone shows it. */
export const guardrailStop = ({
  verdict,
  reason,
}: Pick<GuardrailCheck, 'verdict' | 'reason'>): SendResult & { status: 'ask' | 'blocked' } => ({
  status: verdict === 'block' ? 'blocked' : 'ask',
  reason,
});

/**
 * A reply: typed now through `mesa send`'s path (the guardrail has the last word), or, to a
 * session at work that the guardrail lets through (or the person said Send anyway), queued for
 * when its turn ends. A reply the guardrail stops goes on to `mesa send`, which refuses it with
 * its receipt and types nothing. A plain terminal has no turn: its line goes through `mesa type`
 * at once, and it takes no photo.
 */
async function reply(
  deps: SteerDeps,
  row: PhoneRow,
  call: Extract<SteerCall, { method: 'send' }>,
): Promise<SendResult> {
  if (row.terminal && call.image)
    throw new MesaError('usage', `session ${row.id} is a terminal; it takes no photo`);
  const text = call.image
    ? deps.image(row.id, Buffer.from(call.image, 'base64'), call.text)
    : call.text;
  const yes = call.yes ?? false;
  if (!row.terminal && waitsForTurn(row.state)) {
    const { verdict } = await deps.check(row.id, text);
    if (verdict === 'allow' || (verdict === 'ask' && yes)) {
      deps.queue.add(row.id, text, yes);
      return { status: 'queued' };
    }
  }
  try {
    await (row.terminal ? deps.type : deps.send)(row.id, text, yes);
    return { status: 'sent' };
  } catch (error) {
    if (error instanceof MesaError && error.code === 'guardrail_blocked')
      return guardrailStop(error.details as GuardrailCheck);
    throw error;
  }
}

/** Answers a steering call; `row` is the session as the board has it now, so its state is current. */
export async function answerSteer(
  deps: SteerDeps,
  call: SteerCall,
  row: (id: string) => Promise<PhoneRow>,
): Promise<unknown> {
  switch (call.method) {
    case 'prompts':
      return { prompts: deps.prompts().map(({ name, text }) => ({ name, text })) };
    case 'send':
      return reply(deps, await row(call.id), call);
    case 'unqueue':
      deps.queue.remove(call.message);
      return {};
    case 'act': {
      const session = await deps.act(call.id, call.action, call.text);
      return session ? { session } : {};
    }
  }
}
