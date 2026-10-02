import type { RuleRow, WorkspaceFile } from '@mesa/core';
import { FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileEditor } from '@/features/files/FileEditor';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/** Existing native rules, edited only through the same checked file path as Files. */
export function RulesTab(props: { project: string; onDirtyChange: (dirty: boolean) => void }) {
  const rules = useCommand('rules.list', { project: props.project });
  const config = useCommand('config.get');
  const run = useRun();
  const { acting, act } = useAct();
  const [filter, setFilter] = useState<'all' | 'global' | 'project'>('all');
  const [selected, setSelected] = useState<RuleRow>();
  const [opened, setOpened] = useState<WorkspaceFile>();
  const [draft, setDraft] = useState('');
  const dirty = Boolean(opened && draft !== opened.text);
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
  const visible = (rules.data ?? []).filter(
    (row) =>
      filter === 'all' ||
      (filter === 'project' ? row.scope === 'project' : row.scope !== 'project'),
  );
  const open = async (row: RuleRow) => {
    if (dirty) return;
    const document = await run('rules.read', { id: row.id, project: props.project });
    if (!document) return;
    setSelected(row);
    setOpened(document);
    setDraft(document.text);
  };
  const save = () =>
    act(async () => {
      if (!selected || !opened || !selected.writable) return undefined;
      const result = await run('rules.write', {
        id: selected.id,
        project: props.project,
        text: draft,
        revision: opened.revision,
      });
      if (!result) return undefined;
      setOpened({ ...opened, text: draft, revision: result.revision ?? opened.revision });
      await rules.refresh();
      return said(`Saved ${selected.name}`, result);
    });
  return (
    <section data-testid="rules-workspace" className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Rules</h3>
        <Muted size="xs">Native instruction files from your project, profile, and providers.</Muted>
      </div>
      <fieldset className="flex gap-1">
        <legend className="sr-only">Rule scope</legend>
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
                  <Badge variant="outline" className="capitalize">
                    {row.scope}
                  </Badge>
                </div>
                <Muted size="xs" className="truncate">
                  {row.path}
                </Muted>
                <Muted size="xs">{row.providers.join(', ')}</Muted>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
      {visible.length === 0 && <Muted>No rules found.</Muted>}
      {selected && opened && (
        <section className="space-y-3 rounded-lg border bg-card/35 p-4" aria-label="Rule details">
          <div className="flex items-center gap-2">
            <h4 className="min-w-0 flex-1 truncate font-medium">{selected.name}</h4>
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
          <Muted size="xs" className="break-all">
            {selected.path}
          </Muted>
          {selected.readOnlyReason && (
            <p className="text-xs">Read-only: {selected.readOnlyReason}</p>
          )}
          {config.data && (
            <FileEditor
              key={selected.id}
              path={selected.name}
              value={draft}
              initialText={opened.text}
              onChange={setDraft}
              preferences={config.data.editor}
              readOnly={!selected.writable}
            />
          )}
        </section>
      )}
    </section>
  );
}
