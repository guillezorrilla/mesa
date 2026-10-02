import type { ProjectRow } from '@mesa/core';
import type { ComponentProps } from 'react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/**
 * A registered project, as the form's `project`, for a new session or a skill run; a project
 * whose folder is gone is a disabled option, since nothing can start there.
 */
export function ProjectSelect({
  projects,
  ...props
}: ComponentProps<typeof NativeSelect> & { projects: ProjectRow[] | undefined }) {
  return (
    // ponytail: native, so the form reads it and a project whose folder is gone is a disabled
    // option; shadcn's Select when the list needs search.
    <NativeSelect name="project" required {...props}>
      {projects?.map((p) => (
        <NativeSelectOption key={p.name} value={p.name} disabled={!p.exists}>
          {p.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
