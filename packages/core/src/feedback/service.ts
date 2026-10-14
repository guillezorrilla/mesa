import { buildNumber } from '../about/about.js';
import type { MesaContext } from '../context.js';
import { brokerUrl } from '../sources/broker.js';
import { type FeedbackInput, sendFeedback } from './send.js';

/** A person's feedback, sent through the broker to a private repo (ADR-0025). */
export function feedbackService(ctx: MesaContext) {
  return {
    send: (input: FeedbackInput) =>
      sendFeedback(
        {
          http: ctx.http,
          broker: brokerUrl(ctx.env),
          version: ctx.version,
          build: buildNumber(ctx.release),
        },
        input,
      ),
  };
}
