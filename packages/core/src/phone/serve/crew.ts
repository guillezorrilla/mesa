import type { z } from 'zod';
import type { Evaluation } from '../../decisions/evaluate.js';
import type { DecisionRequest } from '../../decisions/request.js';
import { MesaError } from '../../lib/result.js';
import type { CrewRow } from '../../sessions/board/crew.js';
import { crewTitle, taskTitle } from '../../sessions/record/labels.js';
import type { SessionMerge } from '../../sessions/service/merge.js';
import type { OpenGate } from '../../tasks/gates.js';
import type { Task } from '../../tasks/task-file.js';
import { crewCalls, type PhoneGate } from '../protocol/crew.js';
import type { CallResult } from '../protocol/rpc.js';
import { gateAdvice, gateRequest } from './gate-advice.js';

/** The crew functions the CLI uses (`mesa sessions --children`, `tasks`, `gates`, `merge`). */
export type CrewDeps = {
  crew: (id: string) => Promise<CrewRow[]>;
  /** Every task, `coordinator`'s only when given, each as it reads (blocked by an open gate). */
  tasks: (coordinator?: string) => Task[];
  gates: () => OpenGate[];
  /** Decision assistance's on-demand evaluate for `session`, answering within GATE_ADVICE_MS. */
  advise: (request: DecisionRequest, session: string) => Promise<Evaluation>;
  resolve: (id: string, option: string) => unknown;
  merge: (id: string) => Promise<{ result: SessionMerge }>;
};

/** How long the Mac gives the Decision model on a gate, inside the phone's 10 s wait. */
export const GATE_ADVICE_MS = 6_000;

type CrewCall = z.infer<(typeof crewCalls)[number]>;
const CREW_METHODS = new Set<string>(crewCalls.map((call) => call.shape.method.value));
export const isCrewCall = (call: { method: string }): call is CrewCall =>
  CREW_METHODS.has(call.method);

const toPhoneGate = (gate: OpenGate, tasks: readonly Task[]): PhoneGate => {
  const task = tasks.find((each) => each.id === gate.task);
  return {
    id: gate.id,
    question: gate.question,
    options: gate.options,
    task: task ? taskTitle(task.spec) : gate.task,
    coordinator: gate.coordinator ?? null,
  };
};

/** The advice on `gate`, or why there is none: no coordinator, or one no longer live. */
async function advised(deps: CrewDeps, gate: PhoneGate) {
  if (!gate.coordinator)
    return { status: 'unavailable', odds: [], reason: 'the task has no coordinator' };
  try {
    return gateAdvice(gate, await deps.advise(gateRequest(gate), gate.coordinator));
  } catch (error) {
    return { status: 'unavailable', odds: [], reason: (error as Error).message };
  }
}

/** Answers one crew call (#1066); throws a MesaError (not_found) for an unknown gate. */
export async function answerCrewCall(deps: CrewDeps, call: CrewCall): Promise<unknown> {
  if (call.method === 'crew') {
    const [rows, tasks] = [await deps.crew(call.id), deps.tasks(call.id)];
    const gated = new Map(deps.gates().map((gate) => [gate.task, gate.id]));
    return {
      workers: rows.map((row) => ({
        id: row.id,
        title: crewTitle(row),
        state: row.lastState.state,
        branch: row.branch,
        ...(row.report
          ? {
              report: {
                kind: row.report.kind,
                at: row.report.at,
                message: row.report.message,
                ...(row.report.outcome ? { outcome: row.report.outcome } : {}),
              },
            }
          : {}),
      })),
      tasks: tasks.map((task) => {
        const gate = gated.get(task.id);
        return {
          id: task.id,
          title: taskTitle(task.spec),
          state: task.state,
          deps: task.deps,
          ...(task.worker ? { worker: task.worker } : {}),
          ...(gate ? { gate } : {}),
        };
      }),
    } satisfies CallResult<'crew'>;
  }
  if (call.method === 'gates') {
    const tasks = deps.tasks();
    return { gates: deps.gates().map((gate) => toPhoneGate(gate, tasks)) };
  }
  if (call.method === 'gate') {
    const open = deps.gates().find((gate) => gate.id === call.id);
    if (!open) throw new MesaError('not_found', `no open gate ${call.id}`);
    const gate = toPhoneGate(open, deps.tasks());
    return { ...gate, advice: await advised(deps, gate) } satisfies CallResult<'gate'>;
  }
  if (call.method === 'resolve') {
    deps.resolve(call.id, call.option);
    return {};
  }
  const { result } = await deps.merge(call.id);
  return {
    merged: result.merged,
    branch: result.branch,
    conflicts: result.merged ? [] : result.conflicts,
  } satisfies CallResult<'merge'>;
}
