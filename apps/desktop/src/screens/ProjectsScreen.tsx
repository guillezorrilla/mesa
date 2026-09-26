import { FolderPlus, Play } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePlatform } from '@/lib/MesaRoot';
import { useCommand, useRun } from '@/lib/useCommand';

/** The profile's registered projects: open a session on one, or register a folder. */
export function ProjectsScreen() {
  const { data: projects, refresh } = useCommand('projects.list');
  const run = useRun();
  const platform = usePlatform();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const [opening, setOpening] = useState(false);

  // One open at a time, so a double click starts one session, not two.
  const openSession = async (project: string) => {
    setOpening(true);
    try {
      const session = await run('sessions.open', { project });
      if (session) toast(`Opened session ${session.id} on ${project}`);
    } finally {
      setOpening(false);
    }
  };

  // One picker at a time: the button stays disabled until the register and refresh finish.
  const registerFolder = async () => {
    setBusy(true);
    try {
      const path = await platform.pickFolder();
      if (path && (await run('projects.register', { path }))) await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="projects-screen" className="space-y-4">
      <PageHeader title="Projects" description="The repositories this profile has registered.">
        <Button data-testid="register-folder" onClick={registerFolder} disabled={busy}>
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
                <TableCell className="text-right">
                  {p.exists && (
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="open-session"
                      onClick={() => openSession(p.name)}
                      disabled={opening}
                    >
                      <Play aria-hidden />
                      Open session
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
