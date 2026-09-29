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
  identityChanged = false,
): InstructionStatus {
  if (identityChanged)
    return {
      state: 'conflicting',
      reason: 'Native conversation changed after /clear; reopen through Mesa',
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

/** A bounded native hook supplement; provider and repository instructions stay intact. */
export function mesaPointer(record: SessionRecord, profile: string, cwd: string): string {
  const prefix = record.agent === 'codex' ? '$' : '/';
  const skills =
    record.project === GENERAL_PROJECT
      ? 'mesa skills list --json'
      : `mesa skills list ${record.project} --json`;
  return [
    `Mesa session ${record.id}; profile ${profile}; project ${record.project}; cwd ${JSON.stringify(cwd)}.`,
    `Your saved goal is in the startup prompt; keep it unchanged. mesa show ${record.id} --json can inspect its record when needed.`,
    `Use mesa help --agent for command syntax and ${skills} for skills. Invoke skills in this terminal with ${prefix}skill-name.`,
    'Coordinate with mesa sessions --json, mesa open, mesa open --after, mesa send, and mesa handoff. Check state before messaging. A human must answer permission and question prompts.',
    'Mesa guardrails check sent prompts; do not bypass a block without the user. Save meaningful decisions and vault changes, not routine operational events. Connected vault discovery is unavailable until P5.',
  ].join('\n');
}
