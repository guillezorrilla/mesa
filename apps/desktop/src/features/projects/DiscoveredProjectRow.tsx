import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * A found folder that can be registered as a project: its name, path, any error, `detail` below
 * them, and `verb` (Import, Register) as its button, or the past tense as a badge once registered.
 */
export function DiscoveredProjectRow(props: {
  project: { name: string; path: string; registered: boolean; error?: string };
  verb: 'Import' | 'Register';
  detail?: ReactNode;
  disabled: boolean;
  onRegister: () => void;
}) {
  const { project } = props;
  return (
    <div
      data-testid="discovered-project"
      className="flex items-center gap-3 rounded-md border p-3 text-sm"
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium">{project.name}</div>
        <div className="truncate font-mono text-muted-foreground text-xs" title={project.path}>
          {project.path}
        </div>
        {props.detail}
        {project.error && <p className="text-destructive text-xs">{project.error}</p>}
      </div>
      {project.registered ? (
        <Badge variant="secondary">{props.verb}ed</Badge>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={props.disabled || Boolean(project.error)}
          onClick={props.onRegister}
        >
          {props.verb}
        </Button>
      )}
    </div>
  );
}
