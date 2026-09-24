import { useState } from 'react';
import { usePlatform } from '../lib/MesaRoot';
import { useCommand, useRun } from '../lib/useCommand';

export function ProjectsScreen() {
  const { data: projects, refresh } = useCommand('projects.list');
  const run = useRun();
  const platform = usePlatform();
  const [busy, setBusy] = useState(false);

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
    <section data-testid="projects-screen">
      <h2>Projects</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Path</th>
            <th>Agent</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          {projects?.map((p) => (
            <tr key={p.name} data-testid="project-row">
              <td>
                {p.name}
                {!p.exists && (
                  <span data-testid="project-missing" style={{ color: 'red' }} title="path is gone">
                    {' ✗'}
                  </span>
                )}
              </td>
              <td>{p.path}</td>
              <td>{p.agent ?? ''}</td>
              <td>{p.priority ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" data-testid="register-folder" onClick={registerFolder} disabled={busy}>
        Register folder
      </button>
    </section>
  );
}
