import type { DiscoveredProject } from '@mesa/core';
import { repositoryUrl, sessionCount } from '@mesa/core/browser';
import { Columns2, FolderPlus, GitFork, Play, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { said, warned } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/**
 * The profile's registered projects: register a folder, and on each, sync its skills, open a
 * session, or view its sessions side by side.
 */
export function ProjectsScreen(
  props: {
    cloneLink?: { url: string; request: number };
    onRegistered?: () => void;
    onSelectProject?: (name: string) => void;
  } = {},
) {
  const { data: projects, refresh } = useCommand('projects.list');
  const skills = useCommand('skills.list', {});
  const run = useRun();
  const platform = usePlatform();
  const { acting, act } = useAct();
  // Sync and open both link skills into a project: its Skills column reads again after either.
  const [linked, setLinked] = useState(0);
  const [discovered, setDiscovered] = useState<DiscoveredProject[]>();
  const [cloneUrl, setCloneUrl] = useState('');
  useEffect(() => {
    if (props.cloneLink) setCloneUrl(props.cloneLink.url);
  }, [props.cloneLink]);
  let validClone = false;
  try {
    repositoryUrl(cloneUrl);
    validClone = true;
  } catch {
    // The field is not ready; core validates again before git runs.
  }

  const openSession = (project: string) =>
    act(async () => {
      const session = await run('sessions.open', { project });
      if (!session) return undefined;
      setLinked((n) => n + 1);
      return said(`Opened session ${session.id} on ${project}`, session);
    });

  // Its sessions side by side in the terminal app, laid out by its mesa.yaml tmux.layout.
  const viewSessions = (project: string) =>
    act(async () => {
      const viewed = await run('sessions.view', { project });
      const count = viewed && sessionCount(viewed.sessions.length);
      return viewed && said(`Viewing ${count} of ${project} in ${viewed.app}`);
    });

  // Links the profile's and the project's enabled skills into its skill folders.
  const syncSkills = (project: string) =>
    act(async () => {
      const synced = await run('skills.sync', { project });
      if (!synced) return undefined;
      setLinked((n) => n + 1);
      const clashes = synced.conflicts.length
        ? `; ${synced.conflicts.length} of the project's own left alone`
        : '';
      return said(
        `Synced skills into ${project}: ${synced.added.length} added, ${synced.removed.length} removed${clashes}`,
        synced,
      );
    });

  // The button stays disabled until the register and refresh finish.
  const registerFolder = () =>
    act(async () => {
      const path = await platform.pickFolder();
      const registered = path ? await run('projects.register', { path }) : undefined;
      if (!registered) return undefined;
      await refresh();
      props.onRegistered?.();
      return warned(registered.warning);
    });

  const discover = () =>
    act(async () => {
      const root = await platform.pickFolder();
      if (!root) return undefined;
      const found = await run('projects.discover', { path: root });
      if (found) setDiscovered(found);
      return undefined;
    });

  const importProject = (candidate: DiscoveredProject) =>
    act(async () => {
      const registered = await run('projects.register', { path: candidate.path });
      if (!registered) return undefined;
      await refresh();
      props.onRegistered?.();
      setDiscovered((was) =>
        was?.map((row) => (row.path === candidate.path ? { ...row, registered: true } : row)),
      );
      return said(`Imported project ${registered.name ?? candidate.name}`, registered);
    });

  const clone = () =>
    act(async () => {
      const cloned = await run('projects.clone', { url: cloneUrl.trim() });
      if (!cloned) return undefined;
      setCloneUrl('');
      await refresh();
      props.onRegistered?.();
      return said(`Cloned project ${cloned.name}`, cloned);
    });

  return (
    <section data-testid="projects-screen" className="space-y-4">
      <PageHeader title="Projects" description="The repositories this profile has registered.">
        <Button
          variant="outline"
          data-testid="discover-projects"
          onClick={discover}
          disabled={acting}
        >
          <Search aria-hidden /> Discover folders
        </Button>
        <Button data-testid="register-folder" onClick={registerFolder} disabled={acting}>
          <FolderPlus aria-hidden />
          Register folder
        </Button>
      </PageHeader>
      <Card>
        <CardContent>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (validClone) void clone();
            }}
          >
            <Input
              data-testid="repository-url"
              aria-label="Repository URL or Mesa project link"
              value={cloneUrl}
              onInput={(event) => setCloneUrl(event.currentTarget.value)}
              placeholder="HTTPS, SSH, or mesa://clone?url=..."
              className="min-w-64 flex-1 font-mono"
            />
            <Button
              type="submit"
              variant="outline"
              data-testid="clone-project"
              disabled={!validClone || acting}
            >
              <GitFork aria-hidden /> Clone and register
            </Button>
            {cloneUrl && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cancel repository checkout"
                disabled={acting}
                onClick={() => setCloneUrl('')}
              >
                <X aria-hidden />
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
      {discovered && (
        <Card data-testid="discovered-projects">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Found nearby projects</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss discovered projects"
              onClick={() => setDiscovered(undefined)}
            >
              <X aria-hidden />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {discovered.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No projects found within three folder levels.
              </p>
            )}
            {discovered.map((candidate) => (
              <div
                key={candidate.path}
                data-testid="discovered-project"
                className="flex items-center gap-3 rounded-md border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{candidate.name}</div>
                  <div
                    className="truncate font-mono text-muted-foreground text-xs"
                    title={candidate.path}
                  >
                    {candidate.path}
                  </div>
                  {candidate.error && <p className="text-destructive text-xs">{candidate.error}</p>}
                </div>
                {candidate.registered ? (
                  <Badge variant="secondary">Registered</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acting || Boolean(candidate.error)}
                    onClick={() => importProject(candidate)}
                  >
                    Import
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects?.map((p) => (
              <TableRow key={p.name} data-testid="project-row">
                <TableCell className="font-medium">
                  {props.onSelectProject ? (
                    <button
                      type="button"
                      className="text-left underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => props.onSelectProject?.(p.name)}
                    >
                      {p.label}
                    </button>
                  ) : (
                    p.label
                  )}
                  {p.label !== p.name && (
                    <div className="font-mono text-muted-foreground text-xs">{p.name}</div>
                  )}
                  {p.pinned && (
                    <Badge variant="secondary" className="ml-2">
                      Pinned
                    </Badge>
                  )}
                  {p.hidden && (
                    <Badge variant="outline" className="ml-2">
                      Hidden
                    </Badge>
                  )}
                  {!p.exists && (
                    <span
                      data-testid="project-missing"
                      title="path is gone"
                      className="font-semibold text-state-failed"
                    >
                      {' ✗'}
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground text-xs">{p.path}</TableCell>
                <TableCell>{p.agent ?? ''}</TableCell>
                <TableCell className="font-mono tabular-nums">{p.priority ?? ''}</TableCell>
                <TableCell>
                  {p.exists && <SyncedSkills key={`${p.name}-${linked}`} project={p.name} />}
                </TableCell>
                <TableCell className="text-right">
                  {p.exists && (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="sync-skills"
                        title="Link the enabled skills into its .claude/skills and .agents/skills"
                        onClick={() => syncSkills(p.name)}
                        disabled={acting}
                      >
                        <Sparkles aria-hidden />
                        Sync skills
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="open-session"
                        onClick={() => openSession(p.name)}
                        disabled={acting}
                      >
                        <Play aria-hidden />
                        Open session
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="view-sessions"
                        title="Its sessions side by side in your terminal app, laid out by mesa.yaml tmux.layout"
                        onClick={() => viewSessions(p.name)}
                        disabled={acting}
                      >
                        <Columns2 aria-hidden />
                        View sessions
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mesa's skills</CardTitle>
          <CardDescription>
            Enabled in this profile's config.yaml; a project's mesa.yaml can add more. Sync skills
            links them into the project.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {skills.data?.map((s) => (
            <div key={s.name} data-testid="skill-row" className="flex items-start gap-3 text-sm">
              <Badge variant={s.enabled ? 'default' : 'outline'} className="font-mono">
                {s.enabled ? 'enabled' : 'off'}
              </Badge>
              <div>
                <div className="font-medium font-mono">{s.name}</div>
                <div className="text-muted-foreground text-xs">{s.description}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

/** The Mesa skills linked into a project (mesa skills sync, or mesa open, puts them there). */
function SyncedSkills({ project }: { project: string }) {
  const { data } = useCommand('skills.list', { project });
  const linked = data?.filter((s) => s.source === 'mesa' && s.linked) ?? [];
  return (
    <div data-testid="synced-skills" className="flex flex-wrap gap-1">
      {linked.length ? (
        linked.map((s) => (
          <Badge key={s.name} variant="secondary" className="font-mono">
            {s.name}
          </Badge>
        ))
      ) : (
        <span className="text-muted-foreground text-xs">none synced</span>
      )}
    </div>
  );
}
