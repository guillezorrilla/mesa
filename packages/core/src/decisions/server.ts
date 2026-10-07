import { z } from 'zod';
import { projectLabel } from '../sessions/record/general.js';
import type { SessionRecord } from '../sessions/record/record.js';
import type { VaultBinding } from '../vault/mount/binding.js';
import { type McpTool, type Stdio, serveMcp, toolText } from '../vault/mount/mcp-server.js';
import { DecisionRequestSchema } from './request.js';

// The decisions server (ADR-0019, CONTEXT.md Decision assistance): `mesa decisions mcp`, the
// decision_evaluate tool on stdio for the one session its environment binds it to, over the
// vault server's transport and binding. Inert outside a live session, with no Decision model,
// or with assistance turned off for the session.

/** The server's name, as a session's mount names it (#463). */
export const DECISIONS_SERVER = 'mesa-decisions';

const TOOL = 'decision_evaluate';

const { $schema: _, ...inputSchema } = z.toJSONSchema(DecisionRequestSchema);

/** The definitions a ready server lists: fixed, and small, as every provider pays for the list. */
export const DECISION_TOOLS: McpTool[] = [
  {
    name: TOOL,
    description:
      'Advice only: rank vault context for a query, pick a next step among yours, or check evidence for a claim.',
    inputSchema,
  },
];

export type DecisionServerDeps = {
  /** The live session served, or why none; asked on every request. */
  bind: () => VaultBinding;
  /** Why `session` gets no advice now (no Decision model, turned off), or undefined. */
  off: (session: SessionRecord) => string | undefined;
  /** The answer to a call, as `mesa decisions evaluate --json` gives it. */
  answer: (session: SessionRecord, args: unknown, signal: AbortSignal) => Promise<unknown>;
};

/**
 * Serves decision_evaluate on `io` until its input ends, saying on stderr first whom it serves.
 * Each request asks again whether the session is live and has advice on: while not, it lists no
 * tools and refuses every call with the reason, asking no model and writing nothing.
 */
export function serveDecisions(
  io: Stdio,
  version: string,
  deps: DecisionServerDeps,
): Promise<void> {
  const ready = (): VaultBinding => {
    let binding: VaultBinding;
    let why: string | undefined;
    try {
      binding = deps.bind();
      why = 'session' in binding ? deps.off(binding.session) : undefined;
    } catch (error) {
      binding = {
        refused: `session binding failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    return why ? { refused: why } : binding;
  };
  const first = ready();
  io.log(
    'session' in first
      ? `${DECISIONS_SERVER}: serving session ${first.session.id} (${projectLabel(first.session.project)})\n`
      : `${DECISIONS_SERVER}: listing no tools: ${first.refused}\n`,
  );
  return serveMcp(
    io,
    { name: DECISIONS_SERVER, version },
    {
      tools: () => ('session' in ready() ? DECISION_TOOLS : []),
      call: async (name, args, signal) => {
        if (name !== TOOL) return undefined;
        const now = ready();
        if (!('session' in now))
          return toolText(`${DECISIONS_SERVER} is inert: ${now.refused}`, true);
        try {
          return toolText(JSON.stringify(await deps.answer(now.session, args, signal)));
        } catch (error) {
          return toolText(error instanceof Error ? error.message : String(error), true);
        }
      },
    },
  );
}
