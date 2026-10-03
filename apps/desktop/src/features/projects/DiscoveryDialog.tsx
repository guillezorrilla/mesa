import { counted } from '@mesa/core/browser';
import { History } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { DiscoveredProjectRow } from './DiscoveredProjectRow';

/**
 * Find from sessions: the folders where Claude Code and Codex ran lately on this machine, with
 * Register for each, and the sessions running now (`mesa discover`). It only reads, until Register.
 */
export function DiscoveryDialog(props: {
  onCancel: () => void;
  onRegistered: () => Promise<void>;
  returnFocus?: HTMLElement | null;
}) {
  const found = useCommand('sessions.discover');
  const run = useRun();
  const { acting, act } = useAct();
  const [registered, setRegistered] = useState<ReadonlySet<string>>(new Set());
  const data = found.data;
  return (
    <Dialog open onOpenChange={(open) => !open && !acting && props.onCancel()}>
      <DialogContent
        data-testid="discovery-dialog"
        className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={
          props.returnFocus
            ? (event) => {
                event.preventDefault();
                props.returnFocus?.focus();
              }
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History aria-hidden className="size-5 text-ring" />
            Find from sessions
          </DialogTitle>
          <DialogDescription>
            Folders where Claude Code and Codex ran lately on this machine, and the sessions running
            now.
          </DialogDescription>
        </DialogHeader>
        {!data && found.busy && <Muted>Looking for sessions...</Muted>}
        {data && (
          <>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {data.projects.length === 0 && (
                <Muted>No project folders in the last {counted(data.days, 'day')}.</Muted>
              )}
              {data.projects.map((project) => (
                <DiscoveredProjectRow
                  key={project.path}
                  project={{
                    ...project,
                    registered: project.registered || registered.has(project.path),
                  }}
                  verb="Register"
                  detail={
                    <Muted size="xs">
                      {counted(project.conversations, 'conversation')}
                      {project.live ? `, ${project.live} running` : ''}
                    </Muted>
                  }
                  disabled={acting}
                  onRegister={() =>
                    void act(async () => {
                      const done = await run('projects.register', { path: project.path });
                      if (!done) return undefined;
                      setRegistered((paths) => new Set(paths).add(project.path));
                      await props.onRegistered();
                      return said(`Registered project ${done.name}`, done);
                    })
                  }
                />
              ))}
            </div>
            {data.live.length > 0 && (
              <div className="space-y-1">
                <Muted size="xs">Running now</Muted>
                <ul data-testid="discovery-live" className="space-y-1 text-sm">
                  {data.live.map((session) => (
                    <li key={session.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{session.name ?? session.id}</span>
                      <span className="text-muted-foreground text-xs">{session.agent}</span>
                      <span
                        className="max-w-48 truncate font-mono text-muted-foreground text-xs"
                        title={session.cwd}
                      >
                        {session.cwd}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Muted size="xs" data-testid="discovery-total">
              {counted(data.total, 'conversation')} in the last {counted(data.days, 'day')}
              {data.truncated ? `, the newest ${data.conversations.length} read` : ''}.
            </Muted>
          </>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={acting} onClick={props.onCancel}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
