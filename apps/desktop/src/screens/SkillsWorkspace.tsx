import type { Config, SkillInventoryRow, WorkspaceFile } from '@mesa/core';
import { FileText, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FileEditor } from '@/components/FileEditor';
import { said } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

const DEFAULT_EDITOR: Config['editor'] = {
  fontSize: 13,
  tabSize: 2,
  wordWrap: false,
  vim: false,
  external: [],
};

/** Installed skills are browsed here; their invocation stays in the agent terminal. */
export function SkillsWorkspace(props: {
  project: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const skills = useCommand('skills.list', { project: props.project });
  const config = useCommand('config.get');
  const run = useRun();
  const { acting, act } = useAct();
  const [filter, setFilter] = useState<'all' | 'global' | 'project'>('all');
  const [selected, setSelected] = useState<SkillInventoryRow>();
  const [file, setFile] = useState('SKILL.md');
  const [opened, setOpened] = useState<WorkspaceFile>();
  const [draft, setDraft] = useState('');
  const dirty = Boolean(opened && opened.text !== draft);
  useEffect(() => props.onDirtyChange(dirty), [dirty, props.onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const preventClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventClose);
    return () => window.removeEventListener('beforeunload', preventClose);
  }, [dirty]);
  const visible = (skills.data ?? []).filter(
    (row) =>
      filter === 'all' || (filter === 'global' ? row.scope !== 'project' : row.scope === 'project'),
  );
  const open = async (row: SkillInventoryRow, nextFile = 'SKILL.md') => {
    if (dirty) return;
    const document = await run('skills.read', {
      id: row.id,
      project: props.project,
      file: nextFile,
    });
    if (!document) return;
    setSelected(row);
    setFile(nextFile);
    setOpened(document);
    setDraft(document.text);
  };
  const save = () =>
    act(async () => {
      if (!selected || !opened || !selected.writable) return undefined;
      const result = await run('skills.write', {
        id: selected.id,
        project: props.project,
        file,
        text: draft,
        revision: opened.revision,
      });
      if (!result) return undefined;
      setOpened({ ...opened, text: draft, revision: result.revision ?? opened.revision });
      await skills.refresh();
      return said(`Saved ${selected.name}/${file}`, result);
    });
  const toggle = (row: SkillInventoryRow) =>
    act(async () => {
      const enabled = config.data?.skills ?? [];
      const next = enabled.includes(row.name)
        ? enabled.filter((name) => name !== row.name)
        : [...enabled, row.name];
      const changed = await run('config.set', { path: 'skills', value: next });
      if (!changed) return undefined;
      const synced = await run('skills.sync', { project: props.project });
      await Promise.all([config.refresh(), skills.refresh()]);
      if (!synced) return undefined;
      return said(
        `${row.name} ${next.includes(row.name) ? 'enabled' : 'disabled'} in profile`,
        synced,
      );
    });
  const inProfile = selected && config.data?.skills.includes(selected.name);
  return (
    <section data-testid="skills-workspace" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Skills</h3>
          <p className="text-xs text-muted-foreground">
            Invoke an enabled skill from the session terminal with your agent's command.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={acting}
          onClick={() =>
            void act(async () => {
              const synced = await run('skills.sync', { project: props.project });
              if (!synced) return undefined;
              await skills.refresh();
              return said(`Synced skills in ${props.project}`, synced);
            })
          }
        >
          <RefreshCw aria-hidden className="size-4" /> Sync
        </Button>
      </div>
      <fieldset className="flex gap-1">
        <legend className="sr-only">Skill scope</legend>
        {(['all', 'global', 'project'] as const).map((scope) => (
          <Button
            key={scope}
            size="sm"
            variant={filter === scope ? 'secondary' : 'ghost'}
            onClick={() => setFilter(scope)}
            className="capitalize"
          >
            {scope}
          </Button>
        ))}
      </fieldset>
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((row) => (
          <button
            key={row.id}
            type="button"
            disabled={dirty}
            onClick={() => void open(row)}
            className="rounded-lg text-left focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          >
            <Card className={selected?.id === row.id ? 'border-ring' : 'hover:border-ring/70'}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <FileText aria-hidden className="size-4 text-ring" />
                  <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
                  <Badge variant={row.enabled ? 'secondary' : 'outline'}>
                    {row.enabled ? 'Enabled' : 'Off'}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {row.description || row.path}
                </p>
                <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                  <span className="capitalize">{row.scope}</span>
                  <span>· {row.providers.join(', ')}</span>
                  {row.conflicts.length > 0 && (
                    <span className="text-state-attention">· Conflict</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
      {visible.length === 0 && <p className="text-sm text-muted-foreground">No skills found.</p>}
      {selected && opened && (
        <section className="space-y-3 rounded-lg border bg-card/35 p-4" aria-label="Skill details">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="min-w-0 flex-1 truncate font-medium">{selected.name}</h4>
            {selected.source === 'mesa' && (
              <Button
                size="sm"
                variant="outline"
                disabled={acting || !config.data || (selected.enabled && !inProfile)}
                onClick={() => void toggle(selected)}
              >
                {inProfile ? 'Disable in profile' : 'Enable in profile'}
              </Button>
            )}
            {selected.writable && dirty && (
              <Button size="sm" variant="ghost" onClick={() => setDraft(opened.text)}>
                Discard
              </Button>
            )}
            {selected.writable && (
              <Button size="sm" disabled={acting || !dirty} onClick={() => void save()}>
                Save
              </Button>
            )}
          </div>
          <p className="break-all text-xs text-muted-foreground">{selected.path}</p>
          {selected.readOnlyReason && (
            <p className="text-xs">Read-only: {selected.readOnlyReason}</p>
          )}
          {selected.enabled && selected.source === 'mesa' && !inProfile && (
            <p className="text-xs">Enabled by the project's mesa.yaml skill policy.</p>
          )}
          {selected.conflicts.length > 0 && (
            <p className="break-all text-xs text-state-attention">
              Same-name skill also found at {selected.conflicts.join(', ')}
            </p>
          )}
          <fieldset className="flex flex-wrap gap-1">
            <legend className="sr-only">Skill files</legend>
            {['SKILL.md', ...selected.supportFiles].map((name) => (
              <Button
                key={name}
                size="sm"
                variant={file === name ? 'secondary' : 'ghost'}
                disabled={dirty}
                onClick={() => void open(selected, name)}
              >
                {name}
              </Button>
            ))}
          </fieldset>
          <FileEditor
            key={`${selected.id}/${file}`}
            path={file}
            value={draft}
            initialText={opened.text}
            onChange={setDraft}
            preferences={config.data?.editor ?? DEFAULT_EDITOR}
            readOnly={!selected.writable}
          />
        </section>
      )}
    </section>
  );
}
