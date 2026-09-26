import { FolderPlus, Play, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePlatform } from '@/lib/MesaRoot';
import { said, useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/** The profile's registered projects: open a session on one, or register a folder. */
export function ProjectsScreen() {
  const { data: projects, refresh } = useCommand('projects.list');
  const skills = useCommand('skills.list', {});
  const run = useRun();
  const platform = usePlatform();
  const { acting, act } = useAct();
  // Sync and open both link skills into a project: its Skills column reads again after either.
  const [linked, setLinked] = useState(0);

  const openSession = (project: string) =>
    act(async () => {
      const session = await run('sessions.open', { project });
      if (!session) return undefined;
      setLinked((n) => n + 1);
      return said(`Opened session ${session.id} on ${project}`, session);
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
      return registered.warning;
    });

  return (
    <section data-testid="projects-screen" className="space-y-4">
      <PageHeader title="Projects" description="The repositories this profile has registered.">
        <Button data-testid="register-folder" onClick={registerFolder} disabled={acting}>
          <FolderPlus aria-hidden />
          Register folder
        </Button>
      </PageHeader>
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
                  {p.name}
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
