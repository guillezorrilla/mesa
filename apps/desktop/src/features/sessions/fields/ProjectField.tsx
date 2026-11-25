import type { ProjectRow } from '@mesa/core';
import { GENERAL_PROJECT } from '@mesa/core/browser';
import type { ComponentProps } from 'react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/**
 * A registered project, as the form's `project`, for a new session or a skill run (General too
 * with `general`); a project whose folder is gone is a disabled option, since nothing can start there.
 */
export function ProjectField({
  projects,
  general,
  ...rest
}: ComponentProps<typeof NativeSelect> & {
  projects: ProjectRow[] | undefined;
  /** General, first, for a session in no project. */
  general?: boolean;
}) {
  const props = rest;
  return (
    // ponytail: native, so the form reads it and a project whose folder is gone is a disabled
    // option; shadcn's Select when the list needs search.
    <NativeSelect name="project" required {...props}>
      {general && <NativeSelectOption value={GENERAL_PROJECT}>General</NativeSelectOption>}
      {projects?.map((p) => (
        <NativeSelectOption key={p.name} value={p.name} disabled={!p.exists}>
          {p.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
