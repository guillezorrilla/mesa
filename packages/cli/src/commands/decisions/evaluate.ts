import { type DecisionAnswer, MesaError, odds, type Recorded } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { SESSION_FLAG } from '../../input/flags.js';

// `mesa decisions evaluate|context|advise`: one decision request each, answered by the same core
// call as the decision_evaluate tool, so the CLI and the tool answer alike (ADR-0019).

/** stdin as a JSON object, or a usage error showing what to pipe. */
async function stdinObject(stdin: () => Promise<string>, example: string) {
  let input: unknown;
  try {
    input = JSON.parse(await stdin());
  } catch {
    throw new MesaError('usage', `stdin is not JSON: pipe ${example}`);
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new MesaError('usage', `stdin is not a JSON object: pipe ${example}`);
  return input;
}

/** The advice, the sources in order for relevance, and how it was answered. */
function answerText(answer: DecisionAnswer & { receipt?: Recorded<unknown>['receipt'] }) {
  const e = answer.evaluation;
  const sources =
    'sources' in answer ? answer.sources.map((s, i) => `${i + 1}. ${s.id}  ${s.title}`) : [];
  const how = [
    e.status,
    e.model,
    e.margin === undefined ? undefined : `margin ${odds(e.margin)}`,
    e.cached ? 'ready answer' : undefined,
  ].filter(Boolean);
  return [
    answer.advice,
    ...sources,
    how.join(', '),
    ...(answer.receipt ? [`receipt ${answer.receipt.path}`] : []),
  ].join('\n');
}

export const decisionsEvaluate = defineCommand({
  name: 'decisions evaluate',
  summary:
    'Ask the Decision model about a Mesa session: a request on stdin ({"site": "relevance", "next-step" or "evidence", ...}), as decision_evaluate takes it; kept as a decision receipt only with --rationale',
  flags: {
    session: SESSION_FLAG,
    rationale: { type: 'string', description: 'Keep this decision as a receipt: why it matters' },
  },
  example: `echo '{"site":"evidence","claim":"the tests pass","evidence":"Tests 12 passed (12)"}' | mesa decisions evaluate`,
  run: async ({ mesa, stdin, flags }) => {
    const request = await stdinObject(stdin, '{"site": ..., ...}');
    const answer = await mesa.decisions.evaluate(request, {
      ...(flags.session ? { session: flags.session } : {}),
      ...(flags.rationale === undefined ? {} : { rationale: flags.rationale }),
    });
    return { data: answer, text: answerText(answer) };
  },
});

export const decisionsContext = defineCommand({
  name: 'decisions context',
  summary:
    "A Mesa session's scoped context: its project's vault sources for the query (default: its goal), ranked when the Decision model is sure",
  args: ['query?'],
  flags: { session: SESSION_FLAG },
  example: 'mesa decisions context "retry policy for the feed"',
  run: async ({ mesa, args, flags }) => {
    const answer = await mesa.decisions.evaluate(
      { site: 'relevance', ...(args.query ? { query: args.query } : {}) },
      flags.session ? { session: flags.session } : {},
    );
    return { data: answer, text: answerText(answer) };
  },
});

export const decisionsAdvise = defineCommand({
  name: 'decisions advise',
  summary:
    'Advice for a Mesa session: next-step picks one of the candidates on stdin or defers, evidence says whether the evidence on stdin supports the claim; advice never acts',
  args: ['site'],
  flags: { session: SESSION_FLAG },
  example: `echo '{"candidates":[{"id":"add-test","step":"Add a failing test first"},{"id":"ship","step":"Open the PR"}]}' | mesa decisions advise next-step`,
  run: async ({ mesa, args, stdin, flags }) => {
    if (args.site !== 'next-step' && args.site !== 'evidence')
      throw new MesaError('usage', `advise next-step or evidence, not ${args.site}`);
    const request = await stdinObject(
      stdin,
      '{"candidates": [...]} or {"claim": ..., "evidence": ...}',
    );
    const answer = await mesa.decisions.evaluate(
      { ...request, site: args.site },
      flags.session ? { session: flags.session } : {},
    );
    return { data: answer, text: answerText(answer) };
  },
});
