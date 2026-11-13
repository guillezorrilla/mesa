import type { PhoneCrew, UpdateMessage } from '@mesa/core/phone';

/**
 * Whether an update the Mac pushed moves coordinator `id`'s crew: the coordinator's own pushed
 * detail changed (a worker's report reaches its conversation), or a worker is in another state.
 */
export const crewMoved = (
  id: string,
  crew: PhoneCrew | undefined,
  update: Pick<UpdateMessage, 'rows' | 'watched'>,
) =>
  Boolean(crew?.workers.length || crew?.tasks.length) &&
  Boolean(
    update.watched?.some((each) => each.id === id && each.detail) ||
      crew?.workers.some((worker) =>
        update.rows.some((row) => row.id === worker.id && row.state !== worker.state),
      ),
  );
