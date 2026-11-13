import type { MesaContext } from '../../context.js';
import type { Faro } from '../../decisions/faro.js';
import type { Guarded, Overrides } from '../../decisions/guardrail.js';
import type { DecisionRecorder } from '../../decisions/types.js';
import { receiptText } from '../../receipts/command.js';
import type { AnswerVia } from '../answer/answer.js';
import { pressKeys, typeLine } from '../input/terminal-input.js';
import { projectScope } from '../record/general.js';
import type { SessionDeps } from './deps.js';

/**
 * What a person types into a plain terminal session (CONTEXT.md, Plain terminal session): a line
 * through the guardrail (`mesa type`), and keys (`mesa keys`), from the CLI or the phone.
 */
export function terminalActions(ctx: MesaContext, faro: Faro, deps: SessionDeps) {
  const { store, tmux, record, secrets } = ctx;
  const { caller } = deps;
  return {
    terminal: {
      /**
       * Types `line`, then Enter, once the guardrail lets it (`yes`, `force`, a person's
       * `confirm`); its receipt keeps the line's first 80 characters, as a send's does.
       */
      type: (id: string, line: string, opts: Overrides & { via?: AnswerVia } = {}) => {
        const { force = false, yes, confirm, via } = opts;
        const kept = receiptText(line, ctx.argv, secrets());
        const target = store.find(id);
        return record(
          {
            kind: 'guardrail',
            scope: { project: target?.project, session: target?.id },
            argv: kept.argv,
            summary: (r) => `Typed ${r.chars} characters into terminal ${id}`,
            failure: `Could not type into terminal ${id}`,
            project: (r) => projectScope(r.project),
            session: () => id,
            inputs: {
              session: id,
              line: kept.short,
              force,
              ...(yes ? { yes } : {}),
              ...(via ? { via } : {}),
            },
            outputs: (r) => ({
              chars: r.chars,
              ...(r.override ? { override: r.override } : {}),
              ...(via ? { via } : {}),
            }),
          },
          (decisions: DecisionRecorder) =>
            typeLine(
              {
                store,
                tmux,
                caller,
                guard: (action: Guarded) =>
                  faro.guardrail.gate(action, { force, yes, confirm }, decisions),
              },
              id,
              line,
            ),
        );
      },
      /** Presses keys by tmux name (Enter, Escape, Up, C-c), in order. */
      keys: (id: string, keys: readonly string[]) => pressKeys({ store, tmux, caller }, id, keys),
    },
  };
}
