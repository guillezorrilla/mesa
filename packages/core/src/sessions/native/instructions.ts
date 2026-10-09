import { hooksStatus as antigravityHooks } from '../../agents/antigravity/hooks.js';
import { hooksStatus as claudeHooks } from '../../agents/claude/hooks.js';
import { hooksStatus as codexHooks } from '../../agents/codex/hooks.js';
import { codexHome } from '../../agents/codex/paths.js';
import type { Env } from '../../lib/process.js';
import { GENERAL_PROJECT } from '../record/general.js';
import type { SessionRecord } from '../record/record.js';

export type InstructionStatus = {
  state: 'configured' | 'missing' | 'conflicting' | 'unsupported';
  reason: string;
};

/** Current native instruction hook configuration, not proof that a provider consumed a pointer. */
export function instructionStatus(
  agent: SessionRecord['agent'],
  home: string,
  env: Env,
  self: readonly string[],
  identityChanged: boolean | 'ambiguous' = false,
): InstructionStatus {
  if (identityChanged)
    return {
      state: 'conflicting',
      reason:
        identityChanged === 'ambiguous'
          ? 'Another native conversation started; /clear or nested Codex is ambiguous; reopen through Mesa'
          : 'Native conversation changed after /clear; reopen through Mesa',
    };
  try {
    if (agent === 'antigravity') {
      const hooks = antigravityHooks(home, self);
      if (hooks.stale)
        return {
          state: 'conflicting',
          reason: 'Mesa PreInvocation hook is stale; run mesa hooks install',
        };
      return hooks.installed
        ? { state: 'configured', reason: 'PreInvocation hook is configured' }
        : { state: 'missing', reason: 'Run mesa hooks install' };
    }
    const codex = agent === 'codex' ? codexHooks(codexHome(home, env), self) : undefined;
    const hooks = codex ?? claudeHooks(home, env, self);
    if (hooks.stale)
      return { state: 'conflicting', reason: 'Mesa hooks are stale; run mesa hooks install' };
    if (!hooks.events.SessionStart) return { state: 'missing', reason: 'Run mesa hooks install' };
    if (codex && !codex.trusted.SessionStart)
      return { state: 'conflicting', reason: 'Review and trust the Mesa hook in Codex' };
    return { state: 'configured', reason: 'SessionStart hook is configured' };
  } catch {
    return { state: 'conflicting', reason: 'Native hook configuration could not be read' };
  }
}

/**
 * The capability line a pointer ends with while the session's agent has the decision tool (#463):
 * when to ask it (#692: agents did not ask until told), under 400 bytes, beside the pointer's own
 * 1,000.
 */
export const DECISIONS_LINE =
  "Decisions: mesa-decisions' decision_evaluate (or mesa decisions evaluate --json) gives advice only. Before presenting options with a recommendation, ask next-step and show its probabilities beside it and in save_decision; preference questions are the person's. Before claiming a task done, ask evidence. Prompts may carry Mesa advice; weigh it, it never acts.";

/**
 * A bounded native hook supplement, under 1,000 bytes and with no vault content: the session, how
 * to reach Mesa and the vault tools (ADR-0012), and the CLI when they are not there; with
 * `decisions` (the session's agent has the decision tool), DECISIONS_LINE after it. Provider and
 * repository instructions stay intact.
 */
export function mesaPointer(
  record: SessionRecord,
  profile: string,
  cwd: string,
  { decisions = false }: { decisions?: boolean } = {},
): string {
  const prefix = record.agent === 'codex' ? '$' : '/';
  const skills =
    record.project === GENERAL_PROJECT
      ? 'mesa skills list --json'
      : `mesa skills list ${record.project} --json`;
  const vault =
    record.project === GENERAL_PROJECT
      ? 'mesa vault context --general --json'
      : `mesa vault context ${record.project} --json`;
  const lines = [
    `Mesa session ${record.id}; profile ${profile}; project ${record.project}; cwd ${JSON.stringify(cwd)}.`,
    `Your saved goal is in the startup prompt; keep it. Record: mesa show ${record.id} --json.`,
    `Help: mesa help --agent. Skills: ${skills}, invoked here as ${prefix}skill-name.`,
    'Coordinate: mesa sessions --json, mesa open [--after], send, handoff; check state before sending. Only a human answers permission or question prompts.',
    'Guardrails check sent prompts; never bypass a block without the user.',
    "Vault: mesa-vault's project_context, read_note, search_vault and session_goals on demand, when past work bears on the task. After a design decision: search_vault, then save_decision; save_summary, save_note only for lasting knowledge.",
    `Without the tools: ${vault} and the mesa-vault skill.`,
  ];
  if (record.additional) lines.splice(1, 0, alsoIn(record, Buffer.byteLength(lines.join('\n'))));
  return [...lines, ...(decisions ? [DECISIONS_LINE] : [])].join('\n');
}

/** The cap a pointer stays under, in UTF-8 bytes. */
const POINTER_BYTES = 1000;

/**
 * The pointer's line naming a session's additional projects (CONTEXT.md, Additional project):
 * as many as fit in what `used` leaves of the cap, then `and N more`.
 */
function alsoIn(record: SessionRecord, used: number) {
  const names = (record.additional ?? []).map((a) => a.project);
  const line = (shown: string[]) => {
    const more = names.length - shown.length;
    return `Also in projects ${[...shown, ...(more ? [`and ${more} more`] : [])].join(', ')}.`;
  };
  let shown = names;
  // One byte for the line's newline.
  while (shown.length && used + 1 + Buffer.byteLength(line(shown)) >= POINTER_BYTES)
    shown = shown.slice(0, -1);
  return line(shown);
}
