import type { CallResult } from '@mesa/core/phone';
import { useState } from 'react';
import { useMac } from '../mac/useMac';

export type Projects = CallResult<'projects'>['projects'];

/** The Mac's projects, most recently worked on first, as a promise to `use()`; none offline. */
export function useProjects(): Promise<Projects> {
  const link = useMac();
  const [projects] = useState(() =>
    link.call({ method: 'projects' }).then(
      (r) => r.projects,
      () => [],
    ),
  );
  return projects;
}
