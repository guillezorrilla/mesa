import type { GuardrailCheck, ManagedRow } from '@mesa/core';
import { Play, Plus } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { type Message, said, useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAct } from '@/lib/useAct';
import { useCall, useRun } from '@/lib/useCommand';
import { GuardrailDialog, guardrailOf } from './GuardrailDialog';
import { HandoffDialog } from './HandoffDialog';
import { LogDialog } from './LogDialog';
import { NewSessionDialog, type NewSessionInput } from './NewSessionDialog';
import { RemoveDialog } from './RemoveDialog';
import { RenameDialog } from './RenameDialog';
import { RunSkillDialog, type RunSkillInput } from './RunSkillDialog';
import { exited, shown } from './rows';
import { type RowActions, SessionRow } from './SessionRow';
import { TerminalPanel } from './TerminalPanel';
import { useBoard } from './useBoard';

/**
 * The one dialog open on the Board, if any: New session, Run skill, a row's Rename, Hand off,
 * Log, or Remove, or the guardrail's ask on a prompt a row's Send sent (its form is cleared once
 * the prompt goes) or on a skill run.
 */
type OpenDialog =
  | { kind: 'new' | 'run' }
  | { kind: 'rename' | 'handoff' | 'log' | 'remove'; row: ManagedRow }
  | { kind: 'guardrail'; id: string; prompt: string; form: HTMLFormElement; check: GuardrailCheck }
  | { kind: 'run-guardrail'; input: RunSkillInput; check: GuardrailCheck }
  | { kind: 'summary-guardrail'; id: string; check: GuardrailCheck };

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
 * two seconds and after every action; a live session's terminal opens under it. A skill run's
 * toast links to its receipt through `onOpenReceipt`.
 */
export function BoardScreen(props: { onOpenReceipt: (id: string) => void }) {
  const [ended, setEnded] = useState(false);
  const { data, look, collapsed, toggle, elapsed } = useBoard(ended);
  const run = useRun();
  const call = useCall();
  const toast = useToast();
  const [dialog, setDialog] = useState<OpenDialog>();
  const close = () => setDialog(undefined);
  // Embedded terminals, one panel per session, in the order opened; several at once.
  const [panels, setPanels] = useState<string[]>([]);
  // A panel goes with its session: once it is not live (stopped, resumed, exited), tmux would
  // show the view another window of the project.
  const live = new Set((data ?? []).filter((s) => s.managed && !exited(s)).map((s) => s.id));
  if (data && panels.some((id) => !live.has(id))) setPanels(panels.filter((id) => live.has(id)));

  // Every action looks again when it ends, so the Board shows what it did.
  const { acting, act: once } = useAct();
  const act = (action: () => Promise<Message | undefined>) =>
    once(async () => {
      try {
        return await action();
      } finally {
        await look();
      }
    });
  /**
   * Sends a prompt. The guardrail's ask opens its dialog, whose Send anyway sends it again with
   * `yes`; its block is said in the toast, with no way past it here (--force is the CLI's).
   */
  const send = (id: string, prompt: string, form: HTMLFormElement, yes = false) =>
    act(async (): Promise<Message | undefined> => {
      const sent = await call('sessions.send', { id, prompt, yes });
      if (sent.ok) {
        form.reset();
        close();
        // Typed either way: a warning says so, so the prompt is not sent twice.
        return said(`Sent ${sent.data.chars} characters to ${id}`, sent.data);
      }
      const { error } = sent;
      const check = guardrailOf(error);
      if (check?.verdict === 'ask' && !yes) {
        setDialog({ kind: 'guardrail', id, prompt, form, check });
        return undefined;
      }
      close();
      return { text: check ? `Not sent to ${id}: ${check.reason}` : error.message, tone: 'alert' };
    });
  /**
   * Runs a skill, which takes minutes: the dialog closes at once, the Board's looks show the run's
   * row meanwhile, and the other actions stay free. The guardrail answers before the run starts:
   * its ask opens its dialog, whose Run anyway runs it again with `yes`, and its block is said in
   * the toast. The run's end is said in a toast, done or failed, linking to its receipt.
   */
  const runSkill = async (input: RunSkillInput, yes = false) => {
    close();
    const ran = await call('skills.run', { ...input, yes });
    await look();
    if (!ran.ok) {
      const check = guardrailOf(ran.error);
      if (check?.verdict === 'ask' && !yes) {
        setDialog({ kind: 'run-guardrail', input, check });
        return;
      }
      toast(
        check
          ? `Did not run ${input.skill} on ${input.project}: ${check.reason}`
          : ran.error.message,
      );
      return;
    }
    const r = ran.data;
    const how = r.ok ? 'done' : `failed (${r.reason})`;
    const message = said(`Ran ${input.skill} on ${input.project} as ${r.session}: ${how}`, r);
    const { receipt } = r;
    toast(
      message.text,
      r.ok ? message.tone : 'alert',
      receipt
        ? { label: 'Open its receipt', onFollow: () => props.onOpenReceipt(receipt.id) }
        : undefined,
    );
  };
  const summarise = async (id: string, yes = false) => {
    close();
    const ran = await call('sessions.summarise', { id, yes });
    await look();
    if (!ran.ok) {
      const check = guardrailOf(ran.error);
      if (check?.verdict === 'ask' && !yes) {
        setDialog({ kind: 'summary-guardrail', id, check });
        return;
      }
      toast(ran.error.message);
      return;
    }
    const r = ran.data;
    const message = said(
      r.ok ? `Summarised ${id}${r.note ? ` in ${r.note}` : ''}` : `Summary failed: ${r.reason}`,
      r,
    );
    const { receipt } = r;
    toast(
      message.text,
      r.ok ? message.tone : 'alert',
      receipt
        ? { label: 'Open its receipt', onFollow: () => props.onOpenReceipt(receipt.id) }
        : undefined,
    );
  };
  const actions: RowActions = {
    embed: (id) => setPanels((open) => (open.includes(id) ? open : [...open, id])),
    openTerminal: (id) =>
      act(async () => {
        const attached = await run('sessions.attach', { id });
        return attached && said(`Opened ${attached.target} in ${attached.app}`);
      }),
    send: (id, form) => send(id, String(new FormData(form).get('prompt') ?? ''), form),
    stop: (id) =>
      act(async () => {
        const stopped = await run('sessions.stop', { id });
        if (!stopped) return undefined;
        if (stopped.outcome === 'already-ended') return said(`Session ${id} had already ended`);
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
    rename: (row) => row.managed && setDialog({ kind: 'rename', row }),
    handoff: (row) => row.managed && setDialog({ kind: 'handoff', row }),
    log: (row) => row.managed && setDialog({ kind: 'log', row }),
    summarise: (row) => row.managed && void summarise(row.id),
    remove: (row) => row.managed && setDialog({ kind: 'remove', row }),
    adopt: (agentSessionId, project) =>
      act(async () => {
        const adopted = await run('sessions.adopt', { agentSessionId, project });
        return adopted && said(`Adopted as ${adopted.id}`, adopted);
      }),
  };
  const handoff = (id: string, note: string, keep: boolean) =>
    act(async () => {
      const done = await run('sessions.handoff', { id, note, keep });
      if (!done) return undefined;
      close();
      return said(`Handed off ${id} to ${done.to}`, done);
    });
  const rename = (id: string, name: string) =>
    act(async () => {
      const renamed = await run('sessions.rename', { id, name });
      if (!renamed) return undefined;
      close();
      return said(`Renamed ${id} to ${renamed.name}`, renamed);
    });
  const remove = (id: string, opts: { deleteWorktree: boolean; deleteBranch: boolean }) =>
    act(async () => {
      const removed = await run('sessions.remove', { id, ...opts });
      if (!removed) return undefined;
      close();
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
      close();
      return said(`Opened session ${opened.id} on ${opened.project}`, opened);
    });

  return (
    <section data-testid="session-board" className="space-y-4">
      <PageHeader
        title="Board"
        description="Every session, the ones waiting on you first; children sit under their parent."
      >
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Checkbox
            id="sessions-ended"
            data-testid="sessions-ended"
            checked={ended}
            onCheckedChange={(checked) => setEnded(checked === true)}
          />
          <Label htmlFor="sessions-ended" className="font-normal">
            Show older
          </Label>
        </div>
        <Button
          variant="outline"
          data-testid="run-skill"
          onClick={() => setDialog({ kind: 'run' })}
        >
          <Play aria-hidden />
          Run skill
        </Button>
        <Button data-testid="new-session" onClick={() => setDialog({ kind: 'new' })}>
          <Plus aria-hidden />
          New session
        </Button>
      </PageHeader>
      {dialog?.kind === 'new' && (
        <NewSessionDialog onOpen={open} onCancel={close} disabled={acting} />
      )}
      {dialog?.kind === 'run' && (
        <RunSkillDialog onRun={(input) => runSkill(input)} onCancel={close} />
      )}
      {dialog?.kind === 'run-guardrail' && (
        <GuardrailDialog
          action="run"
          about={`/${dialog.input.skill} runs on ${dialog.input.project}`}
          check={dialog.check}
          disabled={false}
          onConfirm={() => runSkill(dialog.input, true)}
          onCancel={close}
        />
      )}
      {dialog?.kind === 'summary-guardrail' && (
        <GuardrailDialog
          action="run"
          about={`summarise session ${dialog.id}`}
          check={dialog.check}
          disabled={false}
          onConfirm={() => summarise(dialog.id, true)}
          onCancel={close}
        />
      )}
      {dialog?.kind === 'handoff' && (
        <HandoffDialog
          row={dialog.row}
          disabled={acting}
          onHandoff={(note, keep) => handoff(dialog.row.id, note, keep)}
          onCancel={close}
        />
      )}
      {dialog?.kind === 'log' && <LogDialog row={dialog.row} onClose={close} />}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          sessionId={dialog.row.id}
          name={dialog.row.name}
          disabled={acting}
          onRename={(name) => rename(dialog.row.id, name)}
          onCancel={close}
        />
      )}
      {dialog?.kind === 'guardrail' && (
        <GuardrailDialog
          action="send"
          about={`this prompt goes to ${dialog.id}`}
          check={dialog.check}
          disabled={acting}
          onConfirm={() => send(dialog.id, dialog.prompt, dialog.form, true)}
          onCancel={close}
        />
      )}
      {dialog?.kind === 'remove' && (
        <RemoveDialog
          row={dialog.row}
          disabled={acting}
          onRemove={(opts) => remove(dialog.row.id, opts)}
          onCancel={close}
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
