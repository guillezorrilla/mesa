import { hooksStatus as antigravityHooks } from '../agents/antigravity/hooks.js';
import { hooksStatus as claudeHooks } from '../agents/claude/hooks.js';
import { hooksStatus as codexHooks } from '../agents/codex/hooks.js';
import { codexHome } from '../agents/codex/paths.js';
import type { Env } from '../lib/process.js';
import { GENERAL_PROJECT } from './general.js';
import type { SessionRecord } from './record.js';

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
      if (hooks.stale) return { state: 'conflicting', reason: 'Mesa PreInvocation hook is stale' };
      return hooks.installed
        ? { state: 'configured', reason: 'PreInvocation hook is configured' }
        : { state: 'missing', reason: 'Run mesa hooks install' };
    }
    const codex = agent === 'codex' ? codexHooks(codexHome(env, home), self) : undefined;
    const hooks = codex ?? claudeHooks(home, self);
    if (hooks.stale) return { state: 'conflicting', reason: 'Mesa SessionStart hook is stale' };
    if (!hooks.events.SessionStart) return { state: 'missing', reason: 'Run mesa hooks install' };
    if (codex && !codex.trusted.SessionStart)
      return { state: 'conflicting', reason: 'Review and trust the Mesa hook in Codex' };
    return { state: 'configured', reason: 'SessionStart hook is configured' };
  } catch {
    return { state: 'conflicting', reason: 'Native hook configuration could not be read' };
  }
}

/**
 * A bounded native hook supplement, under 1,000 bytes and with no vault content: the session, how
 * to reach Mesa and the vault tools (ADR-0012), and the CLI when they are not there. Provider and
 * repository instructions stay intact.
 */
export function mesaPointer(record: SessionRecord, profile: string, cwd: string): string {
  const prefix = record.agent === 'codex' ? '$' : '/';
  const skills =
    record.project === GENERAL_PROJECT
      ? 'mesa skills list --json'
      : `mesa skills list ${record.project} --json`;
  const vault =
    record.project === GENERAL_PROJECT
      ? 'mesa vault context --general --json'
      : `mesa vault context ${record.project} --json`;
  return [
    `Mesa session ${record.id}; profile ${profile}; project ${record.project}; cwd ${JSON.stringify(cwd)}.`,
    `Your saved goal is in the startup prompt; keep it unchanged. mesa show ${record.id} --json shows its record.`,
    `Syntax: mesa help --agent. Skills: ${skills}, invoked in this terminal as ${prefix}skill-name.`,
    'Coordinate with mesa sessions --json, mesa open [--after], mesa send, and mesa handoff; check state before messaging. Only a human answers permission and question prompts.',
    'Mesa guardrails check sent prompts; do not bypass a block without the user.',
    "Vault: call mesa-vault's project_context first; read_note, search_vault, session_goals on demand. save_decision, save_summary, save_note keep meaningful knowledge, never routine events.",
    `Without the tools: ${vault} and the mesa-vault skill.`,
  ].join('\n');
}
