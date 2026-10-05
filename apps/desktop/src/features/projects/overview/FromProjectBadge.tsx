import type { ManagedRow } from '@mesa/core';
import { Badge } from '@/components/ui/badge';

/**
 * On a project's Overview, marks a session whose primary is another project, the one it is from
 * (CONTEXT.md, Additional project). Nothing for the project's own sessions.
 */
export function FromProjectBadge(props: { session: ManagedRow; project: string }) {
  const from = props.session.project;
  if (from === props.project) return null;
  return (
    <Badge variant="outline" data-testid={`session-from-${from}`}>
      from {from}
    </Badge>
  );
}
