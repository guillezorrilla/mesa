import type { ProjectRow } from '@mesa/core';

/** The project to show once `name` leaves `listed`: the one below it, else above; the first when unlisted. */
export function nearestProject(listed: readonly ProjectRow[], name: string) {
  const at = listed.findIndex((project) => project.name === name);
  return listed[at + 1] ?? listed[at - 1];
}
