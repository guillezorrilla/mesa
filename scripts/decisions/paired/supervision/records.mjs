// What one run of Board placement's paired workflows (#677) used of the Decision model, and each
// arm's waits and model use beside the gate's counts.
import {
  inputCostUsd,
  SYSTEM_ONE_MODELS,
} from '../../../../packages/core/dist/decisions/systemone.js';

/** The placing calls of one session, as `mesa decisions place` reported them. */
export function placingUsage(placed, provider) {
  const use = { calls: 0, answered: 0, accepted: 0, dropped: 0, refused: 0, inputTokens: 0 };
  for (const p of placed) {
    // Asked, but the screen changed before the reply, which is not kept: its tokens are unknown.
    if (p.dropped) {
      use.calls++;
      use.dropped++;
      continue;
    }
    const { ask, placed: state } = p.saved;
    if (ask.fallbackReason?.startsWith('budget reached')) {
      use.refused++;
      continue;
    }
    use.calls++;
    if (ask.inputTokens !== undefined) {
      use.answered++;
      use.inputTokens += ask.inputTokens;
    }
    if (state) use.accepted++;
  }
  const usd = provider
    ? (inputCostUsd(provider, SYSTEM_ONE_MODELS[provider], use.inputTokens) ?? 0)
    : 0;
  return { ...use, usd };
}

/** Each arm's waits and Decision model use, beside the gate's counts. */
export function supervisionSummary(runs) {
  const episodes = runs.flatMap((r) => r.episodes);
  const noticed = episodes
    .map((e) => e.timeToNoticeMs)
    .filter((ms) => ms !== null)
    .sort((a, b) => a - b);
  const mid = noticed.length / 2;
  const sum = (f) => runs.reduce((total, r) => total + f(r), 0);
  return {
    episodes: episodes.length,
    unnoticed: episodes.length - noticed.length,
    medianTimeToNoticeMs: noticed.length
      ? (noticed[Math.floor(mid - 0.5)] + noticed[Math.floor(mid)]) / 2
      : null,
    actsOnWorkingAgent: sum((r) => r.acts.filter((a) => !a.agentStopped).length),
    modelCalls: sum((r) => r.placement.calls + (r.decisions?.calls ?? 0)),
    inputTokens: sum((r) => r.placement.inputTokens + (r.decisions?.inputTokens ?? 0)),
    usd: sum((r) => r.placement.usd + (r.decisions?.usd ?? 0)),
  };
}
