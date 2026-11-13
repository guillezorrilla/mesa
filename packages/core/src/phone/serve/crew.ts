import type { z } from 'zod';
import type { CrewRow } from '../../sessions/board/crew.js';
import { crewTitle, isInternalSession, taskTitle } from '../../sessions/record/labels.js';
import type { SessionMerge } from '../../sessions/service/merge.js';
import type { GateAdvice } from '../../tasks/gate-advice.js';
import type { OpenGate } from '../../tasks/gates.js';
import type { Task } from '../../tasks/task-file.js';
import { crewCalls, type PhoneGate, type PhoneWorker } from '../protocol/crew.js';
import type { CallResult } from '../protocol/rpc.js';

/** The crew functions the CLI uses (`mesa sessions --children`, `tasks`, `gates`, `merge`). */
export type CrewDeps = {
  crew: (id: string) => Promise<CrewRow[]>;
  /** Every task, `coordinator`'s only when given, each as it reads (blocked by an open gate). */
  tasks: (coordinator?: string) => Task[];
  gates: () => OpenGate[];
  /** `mesa gates advise`: an open gate, its task's title and the Decision model's advice. */
  advise: (
    id: string,
    withinMs: number,
  ) => Promise<OpenGate & { title: string; advice: GateAdvice }>;
  resolve: (id: string, option: string) => unknown;
  merge: (id: string) => Promise<{ result: SessionMerge }>;
};

/** How long the Mac gives the Decision model on a gate, inside the phone's 10 s wait. */
const GATE_ADVICE_MS = 6_000;

type CrewCall = z.infer<(typeof crewCalls)[number]>;
const CREW_METHODS = new Set<string>(crewCalls.map((call) => call.shape.method.value));
export const isCrewCall = (call: { method: string }): call is CrewCall =>
  CREW_METHODS.has(call.method);

const toPhoneGate = (gate: OpenGate, title: string): PhoneGate => ({
  id: gate.id,
  question: gate.question,
  options: gate.options,
  task: title,
  coordinator: gate.coordinator ?? null,
});

const toPhoneWorker = (row: CrewRow): PhoneWorker => {
  const report = row.report;
  return {
    id: row.id,
    title: crewTitle(row),
    state: row.lastState.state,
    branch: row.branch,
    ...(report
      ? {
          report: {
            kind: report.kind,
            at: report.at,
            message: report.message,
            ...(report.outcome ? { outcome: report.outcome } : {}),
          },
        }
      : {}),
  };
};

/** Answers one crew call (#1066); throws a MesaError (not_found) for an unknown gate. */
export async function answerCrewCall(deps: CrewDeps, call: CrewCall): Promise<unknown> {
  if (call.method === 'crew') {
    const [rows, tasks] = [await deps.crew(call.id), deps.tasks(call.id)];
    const gated = new Map(deps.gates().map((gate) => [gate.task, gate.id]));
    return {
      // A Setup session or a Skill run is no worker, as on the desktop's Crew panel.
      workers: rows.filter((row) => !isInternalSession(row)).map(toPhoneWorker),
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
    const titles = new Map(deps.tasks().map((task) => [task.id, taskTitle(task.spec)]));
    return {
      gates: deps.gates().map((gate) => toPhoneGate(gate, titles.get(gate.task) ?? gate.task)),
    } satisfies CallResult<'gates'>;
  }
  if (call.method === 'gate') {
    const { title, advice, ...gate } = await deps.advise(call.id, GATE_ADVICE_MS);
    return { ...toPhoneGate(gate, title), advice } satisfies CallResult<'gate'>;
  }
  if (call.method === 'resolve') {
    deps.resolve(call.id, call.option);
    return {} satisfies CallResult<'resolve'>;
  }
  const { result } = await deps.merge(call.id);
  return {
    merged: result.merged,
    branch: result.branch,
    conflicts: result.merged ? [] : result.conflicts,
  } satisfies CallResult<'merge'>;
}
