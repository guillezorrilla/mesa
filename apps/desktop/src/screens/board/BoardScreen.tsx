import type { ManagedRow } from '@mesa/core';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { said, useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { HandoffDialog } from './HandoffDialog';
import { NewSessionDialog, type NewSessionInput } from './NewSessionDialog';
import { RemoveDialog } from './RemoveDialog';
import { RenameDialog } from './RenameDialog';
import { exited, shown } from './rows';
import { type RowActions, SessionRow } from './SessionRow';
import { TerminalPanel } from './TerminalPanel';
import { useBoard } from './useBoard';

const COLUMNS = [
  'Id',
  'Project',
  'Agent',
  'State',
  'Attention',
  'Context',
  'Running',
  'Last output',
  'Actions',
];

/**
 * The Session Board: every session, Mesa's and (muted, read-only) foreign ones, in mesa's order
 * (highest attention first, children under their parent, collapsible), with Faro's state,
 * confidence, and attention, the running time, and the last output line. It looks again every
 * two seconds and after every action; a live session's terminal opens under it.
 */
export function BoardScreen() {
  const [ended, setEnded] = useState(false);
  const { data, look, collapsed, toggle, elapsed } = useBoard(ended);
  const run = useRun();
  const [newOpen, setNewOpen] = useState(false);
  // The row a Rename or a Remove dialog is open for.
  const [renaming, setRenaming] = useState<ManagedRow>();
  const [handingOff, setHandingOff] = useState<ManagedRow>();
  const [removing, setRemoving] = useState<ManagedRow>();
  // Embedded terminals, one panel per session, in the order opened; several at once.
  const [panels, setPanels] = useState<string[]>([]);
  // A panel goes with its session: once it is not live (stopped, resumed, exited), tmux would
  // show the view another window of the project.
  const live = new Set((data ?? []).filter((s) => s.managed && !exited(s)).map((s) => s.id));
  if (data && panels.some((id) => !live.has(id))) setPanels(panels.filter((id) => live.has(id)));

  // Every action looks again when it ends, so the Board shows what it did.
  const { acting, act: once } = useAct();
  const act = (action: () => Promise<string | undefined>) =>
    once(async () => {
      try {
        return await action();
      } finally {
        await look();
      }
    });
  const actions: RowActions = {
    embed: (id) => setPanels((open) => (open.includes(id) ? open : [...open, id])),
    openTerminal: (id) =>
      act(async () => {
        const attached = await run('sessions.attach', { id });
        return attached && `Opened ${attached.target} in ${attached.app}`;
      }),
    send: (id, form) =>
      act(async () => {
        const prompt = String(new FormData(form).get('prompt') ?? '');
        const sent = await run('sessions.send', { id, prompt });
        if (!sent) return undefined;
        form.reset();
        // Typed either way: a warning says so, so the prompt is not sent twice.
        return said(`Sent ${sent.chars} characters to ${id}`, sent);
      }),
    stop: (id) =>
      act(async () => {
        const stopped = await run('sessions.stop', { id });
        if (!stopped) return undefined;
        if (stopped.outcome === 'already-ended') return `Session ${id} had already ended`;
        return said(
          stopped.outcome === 'cancelled'
            ? `Cancelled session ${id}: it never starts`
            : `Stopped session ${id}`,
          stopped,
        );
      }),
    resume: (id) =>
      act(async () => {
        const resumed = await run('sessions.resume', { id });
        return resumed && said(`Resumed session ${id} as ${resumed.id}`, resumed);
      }),
    rename: (row) => row.managed && setRenaming(row),
    handoff: (row) => row.managed && setHandingOff(row),
    remove: (row) => row.managed && setRemoving(row),
    adopt: (agentSessionId, project) =>
      act(async () => {
        const adopted = await run('sessions.adopt', { agentSessionId, project });
        return adopted && said(`Adopted as ${adopted.record.id}`, adopted);
      }),
  };
  const handoff = (id: string, note: string, keep: boolean) =>
    act(async () => {
      const done = await run('sessions.handoff', { id, note, keep });
      if (!done) return undefined;
      setHandingOff(undefined);
      return said(`Handed off ${id} to ${done.to}`, done);
    });
  const rename = (id: string, name: string) =>
    act(async () => {
      const renamed = await run('sessions.rename', { id, name });
      if (!renamed) return undefined;
      setRenaming(undefined);
      return said(`Renamed ${id} to ${renamed.name}`, renamed);
    });
  const remove = (id: string, opts: { deleteWorktree: boolean; deleteBranch: boolean }) =>
    act(async () => {
      const removed = await run('sessions.remove', { id, ...opts });
      if (!removed) return undefined;
      setRemoving(undefined);
      const also = [
        removed.worktree && 'its worktree',
        removed.branch && `branch ${removed.branch}`,
      ];
      const extra = also.filter(Boolean).join(' and ');
      return said(`Removed session ${id}${extra ? ` with ${extra}` : ''}`, removed);
    });
  const open = (input: NewSessionInput) =>
    act(async () => {
      const opened = await run('sessions.open', input);
      if (!opened) return undefined;
      setNewOpen(false);
      return said(`Opened session ${opened.id} on ${opened.project}`, opened);
    });

  return (
    <section data-testid="session-board" className="space-y-4">
      <PageHeader
        title="Board"
        description="Every session, the ones waiting on you first; children sit under their parent."
      >
        <label className="flex items-center gap-2 text-muted-foreground text-sm">
          <Checkbox
            data-testid="sessions-ended"
            checked={ended}
            onCheckedChange={(checked) => setEnded(checked === true)}
          />
          Show older
        </label>
        <Button data-testid="new-session" onClick={() => setNewOpen(true)}>
          <Plus aria-hidden />
          New session
        </Button>
      </PageHeader>
      {newOpen && (
        <NewSessionDialog onOpen={open} onCancel={() => setNewOpen(false)} disabled={acting} />
      )}
      {handingOff && (
        <HandoffDialog
          row={handingOff}
          disabled={acting}
          onHandoff={(note, keep) => handoff(handingOff.id, note, keep)}
          onCancel={() => setHandingOff(undefined)}
        />
      )}
      {renaming && (
        <RenameDialog
          sessionId={renaming.id}
          name={renaming.name}
          disabled={acting}
          onRename={(name) => rename(renaming.id, name)}
          onCancel={() => setRenaming(undefined)}
        />
      )}
      {removing && (
        <RemoveDialog
          row={removing}
          disabled={acting}
          onRemove={(opts) => remove(removing.id, opts)}
          onCancel={() => setRemoving(undefined)}
        />
      )}
      {data?.length === 0 && (
        <p data-testid="sessions-empty" className="text-muted-foreground text-sm">
          No sessions yet: start one with New session.
        </p>
      )}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead key={c}>{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown(data ?? [], collapsed).map(({ row, below }) => (
              <SessionRow
                key={row.id}
                row={row}
                below={below}
                closed={collapsed.has(row.id)}
                onToggle={() => toggle(row.id)}
                elapsed={elapsed}
                acting={acting}
                actions={actions}
              />
            ))}
          </TableBody>
        </Table>
      </Card>
      {panels.map((id) => (
        <TerminalPanel
          key={id}
          sessionId={id}
          busy={acting}
          onOpenExternal={() => actions.openTerminal(id)}
          onClose={() => setPanels((open) => open.filter((p) => p !== id))}
        />
      ))}
    </section>
  );
}
