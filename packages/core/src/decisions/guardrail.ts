/** A prompt Mesa is about to type into a session, as a guardrail sees it. */
export type GuardedSend = { session: string; project: string; text: string };

// ponytail: GUARDRAIL HOOK POINT (P3-3). Allows everything. P3 replaces it with Faro's allow, ask,
// or block, with probabilities and confidence the caller writes into the action's receipt.
export async function guardrail(_send: GuardedSend): Promise<void> {}
