import type { CrewRow, SessionState, Task } from '@mesa/core';
import { crewTitle, duration, isInternalSession, relativeAgo, taskTitle } from '@mesa/core/browser';

/** Where a Crew card stands, as its icon, its colour on the bar and the header's count say it. */
export type Phase =
  | 'needs-you'
  | 'working'
  | 'idle'
  | 'waiting'
  | 'ready'
  | 'done'
  | 'failed'
  | 'cancelled';

/** The session state whose icon and colour a phase wears (stateTone). */
export const PHASE_STATE: Record<Phase, SessionState> = {
  'needs-you': 'waiting-question',
  working: 'working',
  idle: 'idle',
  waiting: 'queued',
  ready: 'queued',
  done: 'done',
  failed: 'failed',
  cancelled: 'stopped',
};

/** One card on the Crew panel: a task with its worker folded in, or a worker with no task. */
export type CrewCard = {
  key: string;
  title: string;
  phase: Phase;
  task?: Task;
  worker?: CrewRow;
  /** The titles of the tasks it still waits on (deps not yet succeeded). */
  waitsFor: string[];
  /** Its worker has an open question to its parent, shown in Your choice. */
  asking: boolean;
  /** Its task has an open decision gate, shown in Your choice. */
  gated: boolean;
};

/** The header's order and words for each phase's count: "1 working, 1 done, 1 needs you". */
const COUNTED: [Phase, string][] = [
  ['working', 'working'],
  ['idle', 'idle'],
  ['ready', 'ready'],
  ['waiting', 'waiting'],
  ['done', 'done'],
  ['failed', 'failed'],
  ['cancelled', 'cancelled'],
  ['needs-you', 'needs you'],
];

/**
 * A worker's phase: waiting on a person (its state, or an open question to its parent) first,
 * then by its state.
 */
const workerPhase = (row: CrewRow, asking: boolean): Phase => {
  const state = row.lastState.state;
  if (asking || state === 'waiting-permission' || state === 'waiting-question') return 'needs-you';
  if (state === 'failed') return 'failed';
  if (state === 'done' || state === 'stopped' || row.endedAt) return 'done';
  if (state === 'idle') return 'idle';
  return state === 'queued' ? 'waiting' : 'working';
};

/** A task's phase: an open gate needs the person; else by its state, a running one by its worker. */
const taskPhase = (task: Task, worker: CrewRow | undefined, gated: boolean, asking: boolean) => {
  if (gated) return 'needs-you';
  // Blocked with no open gate left: resolved elsewhere, until the next read.
  if (task.state === 'blocked') return 'waiting';
  if (task.state === 'succeeded') return 'done';
  if (task.state === 'failed') return 'failed';
  if (task.state === 'cancelled') return 'cancelled';
  if (task.state === 'ready') return 'ready';
  if (task.state === 'pending') return 'waiting';
  return worker ? workerPhase(worker, asking) : 'working';
};

/**
 * The Crew's cards in plan order: each task (oldest first, as `mesa tasks` lists them) with its
 * worker folded in, then each worker with no task, oldest first. Setup sessions are no cards.
 * `gated` holds the tasks with an open decision gate, `asking` the workers with an open question.
 */
export function crewCards(
  tasks: readonly Task[],
  rows: readonly CrewRow[],
  gated: ReadonlySet<string>,
  asking: ReadonlySet<string>,
): CrewCard[] {
  const workers = rows.filter((row) => !isInternalSession(row));
  const byId = new Map(workers.map((row) => [row.id, row]));
  const titleOf = new Map(tasks.map((task) => [task.id, taskTitle(task.spec)]));
  const stateOf = new Map(tasks.map((task) => [task.id, task.state]));
  const planned = tasks.map((task): CrewCard => {
    const worker = task.worker ? byId.get(task.worker) : undefined;
    const asks = Boolean(worker && asking.has(worker.id));
    return {
      key: task.id,
      title: taskTitle(task.spec),
      phase: taskPhase(task, worker, gated.has(task.id), asks),
      asking: asks,
      gated: gated.has(task.id),
      task,
      ...(worker ? { worker } : {}),
      waitsFor: task.deps
        .filter((dep) => stateOf.get(dep) !== 'succeeded')
        .map((dep) => titleOf.get(dep) ?? 'an earlier task'),
    };
  });
  const tasked = new Set(tasks.flatMap((task) => task.worker ?? []));
  const free = workers
    .filter((row) => !tasked.has(row.id))
    .map(
      (row): CrewCard => ({
        key: row.id,
        title: crewTitle(row),
        phase: workerPhase(row, asking.has(row.id)),
        worker: row,
        waitsFor: [],
        asking: asking.has(row.id),
        gated: false,
      }),
    );
  return [...planned, ...free];
}

/** The header's summary: each phase's count in COUNTED order, "1 working, 1 done, 1 needs you". */
export function crewSummary(cards: readonly CrewCard[]) {
  return COUNTED.flatMap(([phase, words]) => {
    const count = cards.filter((card) => card.phase === phase).length;
    return count ? [`${count} ${words}`] : [];
  }).join(', ');
}

/**
 * A card's state in words: "Working for 40s", "Done 2m ago, merged", "Waits for your choice
 * above". `merged` is a merge into the parent this panel saw succeed.
 */
export function phaseWords(card: CrewCard, now: number, merged = false): string {
  const at = card.worker?.lastState.at;
  const since = at ? Math.max(0, Math.round((now - Date.parse(at)) / 1000)) : 0;
  const waits = card.waitsFor.join(', ');
  switch (card.phase) {
    case 'needs-you':
      if (card.gated || !card.worker) return 'Waits for your choice above';
      if (card.asking) return 'Asks you above';
      return card.worker.lastState.state === 'waiting-permission'
        ? 'Waits for your permission in its terminal'
        : 'Waits for your answer in its terminal';
    case 'working':
      return at ? `Working for ${duration(since)}` : 'Starting';
    case 'idle':
      return `Idle for ${duration(since)}`;
    case 'ready':
      return 'Ready to start';
    case 'waiting':
      if (card.task?.state === 'blocked') return 'Waits for a decision';
      return waits ? `Waits for ${waits}` : 'Queued';
    case 'done': {
      const when = card.worker?.endedAt ?? at;
      return `Done${when ? ` ${relativeAgo(when, now)}` : ''}${merged ? ', merged' : ''}`;
    }
    case 'failed':
      return card.task?.reason ? `Failed: ${card.task.reason}` : 'Failed';
    case 'cancelled':
      return 'Cancelled';
  }
}
