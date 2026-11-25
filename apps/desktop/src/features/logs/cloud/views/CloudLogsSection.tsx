import {
  Download,
  EyeOff,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Settings2,
  Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCommand } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import type { WorkspaceView } from '@/lib/workspaceView';
import { CloudEnvsDialog } from '../setup/CloudEnvsDialog';
import { useCloudLogsConfig } from '../useCloudLogsConfig';
import { CloudViewsList } from './CloudViewsList';
import { SaveViewDialog } from './SaveViewDialog';

const ROW =
  'group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring';

/**
 * The sidebar side of the Logs tab (CONTEXT.md, Cloud Logs): the saved views, which open in
 * the Explorer, with Add view for the filters shown; the newest Ask conversations; and a menu that
 * edits the envs, exports and imports the views as YAML, and hides the tab
 * (logs.cloudTab).
 */
export function CloudLogsSection(props: {
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
}) {
  const { views, gcp, refresh, removeView, exportViews, importViews, hideTab } =
    useCloudLogsConfig();
  const asks = useCommand('logs.asks');
  const [adding, setAdding] = useState(false);
  const [editingEnvs, setEditingEnvs] = useState(false);
  const logs = props.view.kind === 'logs' ? props.view : undefined;
  // A new Ask lands in the list as soon as the view moves to it.
  useEffect(() => {
    if (logs?.ask) void asks.refresh();
  }, [logs?.ask, asks.refresh]);
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <div className="flex items-center gap-1 px-2">
          <SectionLabel>Saved views</SectionLabel>
          <IconButton
            label="Add view"
            icon={Plus}
            className="ml-auto"
            onClick={() => setAdding(true)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Logs menu" icon={MoreHorizontal} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {gcp && (
                <DropdownMenuItem onSelect={() => setEditingEnvs(true)}>
                  <Settings2 aria-hidden /> Edit envs
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void exportViews()}>
                <Download aria-hidden /> Export views as YAML
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void importViews()}>
                <Upload aria-hidden /> Import views from YAML
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void hideTab().then(() => props.onView({ kind: 'sessions' }))}
              >
                <EyeOff aria-hidden /> Hide Logs tab
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CloudViewsList
          views={views}
          onOpen={(query) => props.onView({ kind: 'logs', mode: 'explorer', query })}
          onRemove={(name) => void removeView(name)}
        />
      </div>
      <div className="grid gap-1">
        <SectionLabel className="px-2">Asks</SectionLabel>
        {asks.data?.asks.length ? (
          <ul aria-label="Asks">
            {asks.data.asks.slice(0, 8).map((ask) => (
              <li key={ask.id}>
                <button
                  type="button"
                  aria-current={logs?.ask === ask.id ? 'page' : undefined}
                  className={cn(ROW, 'aria-[current=page]:bg-accent')}
                  onClick={() =>
                    props.onView({
                      kind: 'logs',
                      mode: 'explorer',
                      query: ask.turns.at(-1)?.query,
                      ask: ask.id,
                    })
                  }
                >
                  <MessageSquareText
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate">{ask.turns[0]?.question}</span>
                  {ask.turns.length > 1 && (
                    <span className="ml-auto text-[10.5px] text-muted-foreground tabular-nums">
                      {ask.turns.length}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Muted size="xs" className="px-2">
            No Asks yet.
          </Muted>
        )}
      </div>
      {editingEnvs && gcp && (
        <CloudEnvsDialog
          gcp={gcp}
          onCancel={() => setEditingEnvs(false)}
          onSaved={() => {
            setEditingEnvs(false);
            void refresh();
          }}
        />
      )}
      {adding && <SaveViewDialog filters={logs?.query ?? {}} onDone={() => setAdding(false)} />}
    </div>
  );
}
