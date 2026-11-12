import type { MesaContext } from '../../context.js';
import { redactText } from '../../lib/redact.js';
import { receiptText } from '../../receipts/command.js';
import { type AnswerChoice, answerPrompt } from '../answer/answer.js';
import { pendingPrompt } from '../answer/pending.js';
import { projectScope } from '../record/general.js';
import { recordAgent } from '../record/record.js';
import type { SessionDeps } from './deps.js';

/** Where a person answered from, as the receipt names it. */
export const ANSWER_VIAS = ['cli', 'app', 'phone'] as const;
export type AnswerVia = (typeof ANSWER_VIAS)[number];

/** A session's pending prompt, and a person's answer to it with its receipt (CONTEXT.md, Pending prompt). */
export function answerActions(ctx: MesaContext, deps: SessionDeps) {
  const { store, tmux, record, secrets } = ctx;
  const promptDeps = { store, tmux, eventsDir: ctx.paths.events };
  return {
    /** The prompt session `id` waits on, with its options, or why Mesa cannot answer it. */
    prompt: (id: string) => pendingPrompt(promptDeps, id),
    /** Answers it as a person from `via`; refused for an agent caller and when stale. */
    answer: (id: string, choice: AnswerChoice, via: AnswerVia = 'cli') => {
      const target = store.find(id);
      const kept =
        choice.text === undefined ? undefined : receiptText(choice.text, ctx.argv, secrets());
      return record(
        {
          kind: 'answer',
          scope: {
            project: target?.project,
            session: target?.id,
            agent: target ? recordAgent(target) : undefined,
          },
          ...(kept ? { argv: kept.argv } : {}),
          summary: (r) => `Answered session ${id}'s ${r.kind} prompt: ${r.option ?? 'typed'}`,
          failure: `Could not answer session ${id}'s prompt`,
          project: (r) => projectScope(r.project),
          session: () => id,
          inputs: {
            session: id,
            via,
            ...(choice.prompt === undefined ? {} : { prompt: choice.prompt }),
            ...(choice.option === undefined ? {} : { option: choice.option }),
            ...(kept ? { text: kept.short } : {}),
          },
          outputs: (r) => ({
            prompt: r.prompt,
            kind: r.kind,
            summary: redactText(r.summary, secrets()),
            answer: kept && !r.option ? kept.short : r.answer,
          }),
        },
        () => answerPrompt({ ...promptDeps, caller: deps.caller }, id, choice),
      );
    },
  };
}
