import type { ProjectRow, TreeRow } from '@mesa/core';
import { sessionLabel } from '@mesa/core/browser';
import { FolderGit2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCommand } from '@/lib/useCommand';

/** The selected project's existing information and effective skills, in its own workspace. */
export function ProjectWorkspace(props: {
  project: ProjectRow;
  sessions: readonly TreeRow[];
  onSession: (id: string) => void;
}) {
  const { project } = props;
  const [tab, setTab] = useState<'overview' | 'skills'>('overview');
  const skills = useCommand('skills.list', { project: project.name });
  const sessions = props.sessions.filter((s) => s.managed && s.project === project.name);
  return (
    <section data-testid="project-workspace" className="space-y-6">
      <div className="flex items-center gap-3">
        <FolderGit2 aria-hidden className="size-5 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">{project.name}</h2>
          <p className="truncate font-mono text-xs text-muted-foreground" title={project.path}>
            {project.path}
          </p>
        </div>
      </div>
      <nav aria-label={`${project.name} tabs`} className="flex gap-4 border-b">
        {(['overview', 'skills'] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-current={tab === name ? 'page' : undefined}
            className="-mb-px border-b-2 border-transparent px-1 pb-2 text-sm capitalize text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:border-primary aria-[current=page]:text-foreground"
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      {tab === 'overview' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 text-sm">
              <span>Agent: {project.agent ?? 'unknown'}</span>
              <span>Priority: {project.priority ?? 'unknown'}</span>
              {!project.exists && <Badge variant="destructive">Folder unavailable</Badge>}
            </CardContent>
          </Card>
          <div>
            <h3 className="mb-3 text-sm font-semibold">Sessions</h3>
            {sessions.length ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {sessions.map((session) => (
                  <Button
                    key={session.id}
                    variant="outline"
                    className="h-auto justify-start p-3 text-left"
                    onClick={() => props.onSession(session.id)}
                  >
                    <span className="truncate">{sessionLabel(session)}</span>
                    <Badge variant="secondary" className="ml-auto">
                      {session.lastState.state}
                    </Badge>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No sessions for this project yet.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {skills.data?.map((skill) => (
            <Card key={`${skill.source}-${skill.name}`}>
              <CardContent className="flex items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-medium">{skill.name}</div>
                  <p className="text-muted-foreground">{skill.description}</p>
                </div>
                <Badge variant={skill.enabled ? 'secondary' : 'outline'}>
                  {skill.source} · {skill.enabled ? 'enabled' : 'off'}
                </Badge>
              </CardContent>
            </Card>
          ))}
          {skills.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No skills found.</p>
          )}
        </div>
      )}
    </section>
  );
}
