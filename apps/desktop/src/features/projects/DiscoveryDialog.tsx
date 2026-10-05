import type { NativeDiscovery, NativeLive, NativeProject } from '@mesa/core';
import { ADOPTION_WARNING, counted } from '@mesa/core/browser';
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
import { DiscoveryProgressPanel } from './DiscoveryProgressPanel';
import { RunningSessionRow } from './RunningSessionRow';
import { useDiscoveryAdoption } from './useDiscoveryAdoption';

/** `set` with `key` in it when `on`, else without. */
const toggled = (set: ReadonlySet<string>, key: string, on: boolean) => {
  const next = new Set(set);
  if (on) next.add(key);
  else next.delete(key);
  return next;
};

/**
 * Folder `folder`'s conversations as the scan listed them, for `--ids`; none, so that its adoption
 * scans the folder itself, when the scan was cut short before listing them all.
 */
const listedIds = (found: NativeDiscovery, folder: NativeProject) => {
  const ids = found.conversations.flatMap((c) => (c.project === folder.path ? [c.id] : []));
  return found.truncated && ids.length < folder.conversations ? undefined : ids;
};

/** Why running session `session`, in folder `folder`, cannot be ticked; none when it can. */
const untickable = (session: NativeLive, folder: NativeProject | undefined) => {
  if (session.project === null) return 'no project folder';
  if (folder?.registered) return 'in a registered project';
  if (!folder || folder.error) return 'its folder cannot be added';
};

/**
 * Find from sessions (CONTEXT.md, First-run discovery): the folders where Claude Code and Codex
 * ran lately on this machine, each unregistered one ticked, and the sessions running now, none
 * ticked. Add to Mesa registers the ticked folders and adopts their conversations; Skip dismisses.
 * A running session in a registered folder is adopted on its own, by Adopt, as the Board does.
 */
export function DiscoveryDialog(props: {
  onCancel: () => void;
  onRegistered: () => Promise<void>;
  returnFocus?: HTMLElement | null;
}) {
  const found = useCommand('sessions.discover');
  const { acting, act } = useAct();
  const run = useRun();
  const adoption = useDiscoveryAdoption({ onClose: props.onCancel, onAdded: props.onRegistered });
  const { progress } = adoption;
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  // By folder: `--live` reopens every running session of a folder, so they tick together.
  const [liveTicked, setLiveTicked] = useState<ReadonlySet<string>>(new Set());
  // Each running session adopted by Adopt, by its agent session id, to its Mesa id.
  const [adopted, setAdopted] = useState<ReadonlyMap<string, string>>(new Map());
  const data = found.data;
  const ticked = (data?.projects ?? []).filter(
    (p) => !p.registered && !p.error && !unticked.has(p.path),
  );
  const folderTicked = (s: NativeLive) => ticked.some((p) => p.path === s.project);
  const running = Boolean(progress && !progress.summary);
  const adopt = (session: NativeLive) =>
    void act(async () => {
      const done = await run('sessions.adopt', { agentSessionId: session.id });
      if (!done) return undefined;
      setAdopted((map) => new Map(map).set(session.id, done.id));
      return said(`Adopted as ${done.id}`, done);
    });
  const add = () =>
    void act(async () => {
      await adoption.add(
        ticked.map((p) => ({
          path: p.path,
          name: p.name,
          ...(data && { ids: listedIds(data, p) }),
          live: liveTicked.has(p.path),
        })),
      );
      return undefined;
    });
  return (
    <Dialog open onOpenChange={(open) => !open && !running && props.onCancel()}>
      <DialogContent
        data-testid="discovery-dialog"
        className="flex max-h-[calc(100vh-2rem)] flex-col sm:max-w-3xl"
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
            now. Add to Mesa registers the ticked folders and adopts their conversations.
          </DialogDescription>
        </DialogHeader>
        {progress && <DiscoveryProgressPanel progress={progress} />}
        {!progress && !data && found.busy && <Muted>Looking for sessions...</Muted>}
        {!progress && data && (
          <>
            <div
              data-testid="discovery-folders"
              className="min-h-24 flex-1 space-y-2 overflow-y-auto"
            >
              {data.projects.length === 0 && (
                <Muted>No project folders in the last {counted(data.days, 'day')}.</Muted>
              )}
              {data.projects.map((project) => (
                <DiscoveredProjectRow
                  key={project.path}
                  project={project}
                  verb="Register"
                  detail={
                    <Muted size="xs">
                      {counted(project.conversations, 'conversation')}
                      {project.live ? `, ${project.live} running` : ''}
                    </Muted>
                  }
                  disabled={acting}
                  tick={{
                    checked: !project.error && !unticked.has(project.path),
                    onChange: (on) => setUnticked((set) => toggled(set, project.path, !on)),
                  }}
                />
              ))}
            </div>
            {data.live.length > 0 && (
              <div className="space-y-1">
                <Muted size="xs">Running now: {ADOPTION_WARNING}</Muted>
                <Muted size="xs">A tick reopens every running session in that folder.</Muted>
                <ul data-testid="discovery-live" className="space-y-1 text-sm">
                  {data.live.map((session) => {
                    const folder = data.projects.find((p) => p.path === session.project);
                    const adoptedAs = adopted.get(session.id);
                    return (
                      <RunningSessionRow
                        key={session.id}
                        session={session}
                        disabled={acting}
                        reason={adoptedAs ? `adopted as ${adoptedAs}` : untickable(session, folder)}
                        onAdopt={
                          folder?.registered && !adoptedAs ? () => adopt(session) : undefined
                        }
                        tick={{
                          checked: folderTicked(session) && liveTicked.has(session.project ?? ''),
                          disabled: !folderTicked(session),
                          onChange: (on) =>
                            setLiveTicked((set) => toggled(set, session.project ?? '', on)),
                        }}
                      />
                    );
                  })}
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
          {progress?.summary ? (
            <Button type="button" data-testid="discovery-done" onClick={props.onCancel}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                data-testid="discovery-skip"
                disabled={adoption.skipping}
                onClick={() => void adoption.skip()}
              >
                {adoption.skipping ? 'Skipping...' : 'Skip'}
              </Button>
              {!progress && (
                <Button
                  type="button"
                  data-testid="discovery-add"
                  disabled={acting || ticked.length === 0}
                  onClick={add}
                >
                  Add to Mesa
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
