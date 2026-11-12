import { useState } from 'react';
import { useMac } from '../mac/useMac';

type Prompt = { name: string; text: string };

/** The profile's saved prompts (`mesa prompts`) as a promise to `use()`, asked once per screen; none when the Mac does not answer. */
export function usePrompts(): Promise<Prompt[]> {
  const link = useMac();
  const [prompts] = useState(() =>
    link.call({ method: 'prompts' }).then(
      (r) => r.prompts,
      () => [],
    ),
  );
  return prompts;
}
