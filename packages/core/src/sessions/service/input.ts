import type { MesaContext } from '../../context.js';
import type { Faro } from '../../decisions/faro.js';
import type { Guarded, Overrides } from '../../decisions/guardrail.js';
import type { DecisionRecorder } from '../../decisions/types.js';
import { MesaError } from '../../lib/result.js';
import { resolveCheckout } from '../../projects/checkout.js';
import { receiptText } from '../../receipts/command.js';
import { openBrowserExternal } from '../input/browser-address.js';
import {
  type BrowserAnnotationInput,
  clearBrowserElement,
  liveBrowserAnnotation,
  selectBrowserElement,
} from '../input/browser-annotation.js';
import { changeReview, previewChangeReview } from '../input/change-review.js';
import { previewSessionImage, sessionImagePrompt } from '../input/images.js';
import { type ReviewNoteInput, reviewNotes } from '../input/review-notes.js';
import { sendReview } from '../input/reviews.js';
import { sendPrompt } from '../input/send.js';
import { previewResponseReview, sessionResponses } from '../native/responses.js';
import { sessionFolder } from '../record/folder.js';
import { projectScope } from '../record/general.js';
import { recordAgent } from '../record/record.js';
import { refreshReadings } from '../signals/readings.js';
import type { SessionDeps } from './deps.js';

/**
 * What goes into a live session: a prompt, and the image, response, change, and browser reviews
 * that become one.
 */
export function inputActions(ctx: MesaContext, faro: Faro, deps: SessionDeps) {
  const { profile, store, tmux, record, secrets, absolute } = ctx;
  const { caller, ensureBackgroundView, contextDeps } = deps;
  /** A session's review notes, read against the checkout its agent works in now. */
  const notesOf = (id: string) => {
    const found = refreshReadings(contextDeps, store.get(id));
    const project = projectScope(found.project);
    if (!project) throw new MesaError('usage', 'a General session has no diff to note');
    return reviewNotes(
      {
        dir: ctx.paths.reviewNotes,
        lock: ctx,
        clock: ctx.clock,
        newId: ctx.newId,
        run: ctx.run,
        checkout: () => resolveCheckout(ctx.open(), ctx.run, project, sessionFolder(found)),
      },
      id,
    );
  };
  const send = (
    id: string,
    prompt: string,
    opts: { from?: string; noFrom?: boolean } & Overrides = {},
  ) => {
    const { force = false, yes, confirm, from, noFrom } = opts;
    const kept = receiptText(prompt, ctx.argv, secrets());
    const target = store.find(id);
    return record(
      {
        kind: 'guardrail',
        scope: {
          project: target?.project,
          session: target?.id,
          agent: target ? recordAgent(target) : undefined,
          actor: caller().session?.id,
        },
        argv: kept.argv,
        summary: (r) =>
          `Sent ${r.chars} characters to session ${id}${r.from ? ` from ${r.from}` : ''}`,
        failure: `Could not send to session ${id}`,
        warning: (r) => r.warning,
        project: (r) => projectScope(r.project),
        session: () => id,
        inputs: {
          session: id,
          prompt: kept.short,
          force,
          ...(yes ? { yes } : {}),
          ...(from === undefined ? {} : { from }),
          ...(noFrom ? { noFrom } : {}),
        },
        outputs: (r) => ({
          chars: r.chars,
          from: r.from,
          ...(r.override ? { override: r.override } : {}),
        }),
      },
      // Typed, so the result type comes from the action, as for one that takes nothing.
      async (decisions: DecisionRecorder) => {
        const guard = (action: Guarded) =>
          faro.guardrail.gate(action, { force, yes, confirm }, decisions);
        await ensureBackgroundView(id);
        return sendPrompt({ store, tmux, clock: ctx.clock, caller, guard }, id, prompt, {
          force,
          from,
          noFrom,
        });
      },
    );
  };
  return {
    images: {
      preview: (id: string, path: string) =>
        previewSessionImage({ profile, store, absolute }, id, path),
      prompt: (
        id: string,
        path: string,
        revision: string,
        expectedProfile: string,
        note?: string,
      ) =>
        sessionImagePrompt({ profile, store, absolute }, id, path, revision, expectedProfile, note),
    },
    responses: {
      list: (id: string) => sessionResponses({ profile, store, home: ctx.home, env: ctx.env }, id),
      preview: (id: string, input: Parameters<typeof previewResponseReview>[2]) =>
        previewResponseReview({ profile, store, home: ctx.home, env: ctx.env }, id, input),
      send: (
        id: string,
        input: Parameters<typeof previewResponseReview>[2],
        opts: { noFrom?: boolean } & Overrides = {},
      ) =>
        sendReview(
          { store, clock: ctx.clock, send },
          id,
          'response',
          () => previewResponseReview({ profile, store, home: ctx.home, env: ctx.env }, id, input),
          opts,
        ),
    },
    changes: {
      read: (id: string, path: string, staged = false) =>
        changeReview({ profile, store, open: ctx.open, run: ctx.run }, id, path, staged),
      preview: (id: string, input: Parameters<typeof previewChangeReview>[2]) =>
        previewChangeReview({ profile, store, open: ctx.open, run: ctx.run }, id, input),
      send: (
        id: string,
        input: Parameters<typeof previewChangeReview>[2],
        opts: { noFrom?: boolean } & Overrides = {},
      ) =>
        sendReview(
          { store, clock: ctx.clock, send },
          id,
          'change',
          () => previewChangeReview({ profile, store, open: ctx.open, run: ctx.run }, id, input),
          opts,
        ),
    },
    /** Drafts on exact lines of a session's diff (CONTEXT.md, Review note). */
    notes: {
      list: (id: string) => notesOf(id).list(),
      add: (id: string, input: ReviewNoteInput) => notesOf(id).add(input),
      edit: (id: string, note: string, text: string) => notesOf(id).edit(note, text),
      remove: (id: string, note: string) => notesOf(id).remove(note),
    },
    browser: {
      external: (url: string) => openBrowserExternal(url, ctx.run),
      select: (id: string, input: Parameters<typeof selectBrowserElement>[2]) =>
        selectBrowserElement({ profile, store }, id, input),
      clear: (id: string) => clearBrowserElement({ store }, id),
      preview: (id: string, input: BrowserAnnotationInput) =>
        liveBrowserAnnotation(
          {
            profile,
            store,
            processAlive: ctx.processAlive,
            liveSelection: ctx.browserSelection,
          },
          id,
          input,
        ),
      send: (
        id: string,
        input: BrowserAnnotationInput & {
          source: string;
          revision: string;
        },
        opts: { noFrom?: boolean } & Overrides = {},
      ) =>
        sendReview(
          { store, clock: ctx.clock, send },
          id,
          'browser',
          () =>
            liveBrowserAnnotation(
              {
                profile,
                store,
                processAlive: ctx.processAlive,
                liveSelection: ctx.browserSelection,
              },
              id,
              input,
            ),
          opts,
        ),
    },
    /**
     * Types a prompt into a live session's agent, from another session (`from`, else the window
     * this runs in) when there is one, once the guardrail lets it (`yes`, `force`, and a
     * person's `confirm` past an ask or a block). A blocked or overridden guardrail keeps its
     * decision and the prompt's first 80 characters.
     */
    send,
  };
}
