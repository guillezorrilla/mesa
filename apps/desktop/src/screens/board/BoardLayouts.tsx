import type { BoardPreferences, TreeRow } from '@mesa/core';
import { presentSessions } from '@mesa/core/browser';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { shown } from './rows';
import { SessionCard } from './SessionCard';
import { type RowActions, SessionRow } from './SessionRow';

const COLUMNS = ['Id', 'Project', 'Agent', 'State', 'Context', 'Running', 'Last output', 'Actions'];

export function BoardLayouts(props: {
  rows: TreeRow[];
  preferences: BoardPreferences;
  collapsed: ReadonlySet<string>;
  toggle: (id: string) => void;
  elapsed: number;
  acting: boolean;
  actions: RowActions;
  onSelect?: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const groups = presentSessions(props.rows, props.preferences);
  return (
    <div
      data-testid="board-layout"
      data-view={props.preferences.view}
      data-density={props.preferences.density}
      className={
        props.preferences.view === 'workflow'
          ? 'grid grid-flow-col auto-cols-[minmax(14rem,1fr)] gap-3 overflow-x-auto'
          : 'space-y-4'
      }
    >
      {groups.map((group) => (
        <section key={group.key} data-testid="board-group" className="space-y-2">
          {(props.preferences.group !== 'none' || props.preferences.view === 'workflow') && (
            <h3 className="text-sm font-semibold">
              {group.label} <span className="text-muted-foreground">{group.rows.length}</span>
            </h3>
          )}
          {props.preferences.view === 'list' ? (
            <Card
              className={
                props.preferences.density === 'compact'
                  ? 'overflow-x-auto py-0 [&_td]:py-1'
                  : 'overflow-x-auto py-0'
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((column) => (
                      <TableHead key={column}>{column}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown(group.rows, props.collapsed).map(({ row, below }) => (
                    <SessionRow
                      key={row.id}
                      row={row}
                      below={below}
                      closed={props.collapsed.has(row.id)}
                      onToggle={() => props.toggle(row.id)}
                      elapsed={props.elapsed}
                      acting={props.acting}
                      actions={props.actions}
                      onMove={props.preferences.sort === 'manual' ? props.onMove : undefined}
                    />
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <div
              className={
                props.preferences.view === 'cards'
                  ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-3'
                  : 'space-y-2'
              }
            >
              {group.rows.map((row) => (
                <SessionCard
                  key={row.id}
                  row={row}
                  compact={props.preferences.density === 'compact'}
                  acting={props.acting}
                  actions={props.actions}
                  onSelect={props.onSelect}
                  onMove={props.preferences.sort === 'manual' ? props.onMove : undefined}
                />
              ))}
              {group.rows.length === 0 && (
                <p className="text-muted-foreground text-xs">No sessions</p>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
