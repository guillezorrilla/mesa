import type {
  AgentCapabilityReport,
  ClaudeHooksStatus,
  CommandReference,
  DiagnosticReport,
  DoctorReport,
  HooksStatus,
  TmuxWindow,
} from '@mesa/core';
import { command, commandWith, type Recorded } from './spec';

/** What the Doctor and Help read: checks, agents, hooks, tmux windows, mesa's reference. */
export const doctorCommands = {
  'doctor.run': command<DoctorReport>('doctor'),
  /** Installs a missing tmux or agent with Homebrew. */
  'doctor.install': commandWith<{ name: string }, { name: string; installed: true }>(({ name }) => [
    'doctor',
    'install',
    name,
  ]),
  /** Each agent Mesa runs: installed, its version, and the operations qualified on it. */
  'agents.list': command<AgentCapabilityReport>('agents'),
  'diagnostics.list': commandWith<{ event?: string }, DiagnosticReport>(({ event }) => [
    'diagnostics',
    ...(event ? ['--event', event] : []),
  ]),
  'help.reference': command<CommandReference[]>('help', '--agent'),
  'hooks.status': command<HooksStatus>('hooks', 'status'),
  /** Codex's `hint` says how to review its hooks, which Codex asks after their commands change. */
  'hooks.install': command<
    Recorded<ClaudeHooksStatus & { changed: boolean; codex: { changed: boolean; hint: string } }>
  >('hooks', 'install'),
  'hooks.uninstall': command<Recorded<ClaudeHooksStatus & { changed: boolean }>>(
    'hooks',
    'uninstall',
  ),
  'windows.list': command<TmuxWindow[]>('windows'),
};
