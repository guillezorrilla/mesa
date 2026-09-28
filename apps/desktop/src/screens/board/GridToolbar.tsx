import type { GridGroup, ManagedRow } from '@mesa/core';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function GridToolbar(props: {
  live: ManagedRow[];
  panels: string[];
  groups: GridGroup[];
  project: string;
  busy: boolean;
  onProject: (project: string) => void;
  onAdd: (id: string) => void;
  onAddProject: () => void;
  onSave: (name: string) => void;
  onOpenGroup: (group: GridGroup) => void;
  onRemoveGroup: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState('');
  const [removing, setRemoving] = useState<string>();
  const projects = [
    ...new Set([
      ...props.live.map((row) => row.project),
      ...props.groups.flatMap((group) => group.project ?? []),
    ]),
  ].sort();
  const available = props.live.filter(
    (row) =>
      (props.project === 'all' || row.project === props.project) && !props.panels.includes(row.id),
  );
  const selected = available.some((row) => row.id === picked) ? picked : '';
  const visible = props.panels.filter((id) =>
    props.live.some(
      (row) => row.id === id && (props.project === 'all' || row.project === props.project),
    ),
  );
  return (
    <div data-testid="grid-toolbar" className="space-y-3 rounded-lg border p-3">
      <div role="tablist" aria-label="Grid projects" className="flex flex-wrap gap-1">
        {['all', ...projects].map((project) => (
          <Button
            key={project}
            role="tab"
            variant={props.project === project ? 'secondary' : 'ghost'}
            size="sm"
            aria-selected={props.project === project}
            onClick={() => props.onProject(project)}
          >
            {project === 'all' ? 'All projects' : project}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="grid-session-picker"
          aria-label="Live session to add"
          className="h-9 min-w-40 rounded-md border border-input bg-background px-2 text-sm"
          value={selected}
          onChange={(event) => setPicked(event.target.value)}
        >
          <option value="">Choose live session</option>
          {available.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name ?? row.id} ({row.project})
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          disabled={!selected || props.busy}
          onClick={() => {
            props.onAdd(selected);
            setPicked('');
          }}
        >
          <Plus aria-hidden /> Add tile
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={available.length === 0 || props.busy}
          onClick={props.onAddProject}
        >
          Open project sessions
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          data-testid="grid-group-name"
          aria-label="Grid group name"
          className="w-48"
          placeholder="Group name"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!name.trim() || visible.length === 0 || props.busy}
          onClick={() => props.onSave(name)}
        >
          <Save aria-hidden /> Save group
        </Button>
      </div>
      <div data-testid="grid-groups" className="flex flex-wrap gap-2">
        {props.groups.map((group) => (
          <div
            key={group.name}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
          >
            <Button variant="ghost" size="sm" onClick={() => props.onOpenGroup(group)}>
              {group.name} ({group.sessions.length})
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                removing === group.name ? `Confirm remove ${group.name}` : `Remove ${group.name}`
              }
              onClick={() => {
                if (removing === group.name) {
                  props.onRemoveGroup(group.name);
                  setRemoving(undefined);
                } else setRemoving(group.name);
              }}
              disabled={props.busy}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
        {props.groups.length === 0 && (
          <span className="text-muted-foreground text-xs">No saved groups</span>
        )}
      </div>
    </div>
  );
}
