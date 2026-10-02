import { expect, test } from 'vitest';
import { CLAUDE_MOUNT, CODEX_MOUNT, NATIVE_LAUNCH, tempDir } from '../testing/index.js';
import { AGENTS, startCommand } from './agents.js';
import { dangerousFlags, type LaunchDefaults } from './launch-flags.js';
import { vaultServer } from './vault-mount.js';

// The profile's launch defaults on the commands every start, resume, and fork runs, in each
// agent's own syntax, under the mount testDeps launches carry.

const SERVER = vaultServer(['/usr/local/bin/mesa']);
const ID = '360ed2a1-f255-4c2a-8f30-ba7b6ea349f5';
const FOLDER = '/src/lantern-cove';
const set = (patch: Partial<LaunchDefaults>): LaunchDefaults => ({ ...NATIVE_LAUNCH, ...patch });

test('unset defaults emit nothing, so each agent starts on its native config', () => {
  expect(startCommand('claude', SERVER, NATIVE_LAUNCH, { agentSessionId: ID })).toBe(
    `claude --session-id ${ID} ${CLAUDE_MOUNT}`,
  );
  expect(startCommand('codex', SERVER, NATIVE_LAUNCH, {})).toBe(
    `codex -c mesa.embedded=true ${CODEX_MOUNT}`,
  );
  expect(startCommand('antigravity', SERVER, NATIVE_LAUNCH, { id: 'a1', logs: tempDir() })).toMatch(
    /^umask 077; exec agy --log-file '[^']+'$/,
  );
  // False is the same as unset.
  const off = set({ claude: { skipPermissions: false }, codex: { bypass: false } });
  expect(startCommand('claude', SERVER, off, { agentSessionId: ID })).not.toContain('dangerous');
  expect(startCommand('codex', SERVER, off, {})).not.toContain('dangerous');
});

test('Claude Code skips permissions on start, resume, and fork; plan from the session wins', () => {
  const skip = set({ claude: { skipPermissions: true } });
  expect(startCommand('claude', SERVER, skip, { agentSessionId: ID, goal: 'go' })).toBe(
    `claude --session-id ${ID} --dangerously-skip-permissions ${CLAUDE_MOUNT} 'go'`,
  );
  expect(AGENTS.claude.resume(ID, FOLDER, SERVER, skip)).toBe(
    `claude --resume ${ID} --dangerously-skip-permissions ${CLAUDE_MOUNT}`,
  );
  expect(AGENTS.claude.fork(ID, FOLDER, SERVER, skip)).toBe(
    `claude --resume '${ID}' --fork-session --dangerously-skip-permissions ${CLAUDE_MOUNT}`,
  );
  expect(startCommand('claude', SERVER, skip, { agentSessionId: ID, mode: 'plan' })).toBe(
    `claude --session-id ${ID} --permission-mode plan ${CLAUDE_MOUNT}`,
  );
  expect(AGENTS.claude.resume(ID, FOLDER, SERVER, skip, 'plan')).toBe(
    `claude --resume ${ID} --permission-mode plan ${CLAUDE_MOUNT}`,
  );
});

test('Codex takes its approval policy and sandbox; bypass replaces both', () => {
  const both = set({ codex: { approvalPolicy: 'on-request', sandbox: 'workspace-write' } });
  const flags = '--ask-for-approval=on-request --sandbox=workspace-write';
  expect(startCommand('codex', SERVER, both, { goal: 'review' })).toBe(
    `codex -c mesa.embedded=true ${flags} ${CODEX_MOUNT} -- 'review'`,
  );
  expect(AGENTS.codex.resume('019a', FOLDER, SERVER, both)).toBe(
    `codex -c mesa.embedded=true ${flags} ${CODEX_MOUNT} resume '019a' -C '${FOLDER}'`,
  );
  expect(AGENTS.codex.fork('019a', FOLDER, SERVER, both)).toBe(
    `codex -c mesa.embedded=true ${flags} ${CODEX_MOUNT} fork '019a' -C '${FOLDER}'`,
  );
  expect(startCommand('codex', SERVER, set({ codex: { sandbox: 'read-only' } }), {})).toBe(
    `codex -c mesa.embedded=true --sandbox=read-only ${CODEX_MOUNT}`,
  );
  const bypass = set({ codex: { approvalPolicy: 'never', sandbox: 'read-only', bypass: true } });
  expect(startCommand('codex', SERVER, bypass, {})).toBe(
    `codex -c mesa.embedded=true --dangerously-bypass-approvals-and-sandbox ${CODEX_MOUNT}`,
  );
  expect(AGENTS.codex.resume('019a', FOLDER, SERVER, bypass)).toBe(
    `codex -c mesa.embedded=true --dangerously-bypass-approvals-and-sandbox ${CODEX_MOUNT} resume '019a' -C '${FOLDER}'`,
  );
});

test('Antigravity takes skip permissions, its mode, and sandbox; plan from the session wins', () => {
  const logs = tempDir();
  const all = set({
    antigravity: { skipPermissions: true, mode: 'accept-edits', sandbox: true },
  });
  const flags = '--dangerously-skip-permissions --mode=accept-edits --sandbox';
  expect(startCommand('antigravity', SERVER, all, { id: 'a1', logs, goal: 'go' })).toMatch(
    new RegExp(`^umask 077; exec agy --log-file '[^']+' ${flags} --prompt-interactive 'go'$`),
  );
  expect(AGENTS.antigravity.resume('conv-1', '/l.log', all)).toBe(
    `umask 077; exec agy --log-file '/l.log' --conversation 'conv-1' ${flags}`,
  );
  expect(startCommand('antigravity', SERVER, all, { id: 'a2', logs, mode: 'plan' })).toMatch(
    / --mode=plan --dangerously-skip-permissions --sandbox$/,
  );
  expect(AGENTS.antigravity.resume('conv-1', '/l.log', all, 'plan')).toBe(
    `umask 077; exec agy --log-file '/l.log' --conversation 'conv-1' --mode=plan --dangerously-skip-permissions --sandbox`,
  );
});

test('the dangerous flags are the ones that turn off permission checks or the sandbox', () => {
  expect(dangerousFlags('claude', set({ claude: { skipPermissions: true } }))).toEqual([
    '--dangerously-skip-permissions',
  ]);
  expect(dangerousFlags('claude', set({ claude: { skipPermissions: true } }), 'plan')).toEqual([]);
  expect(dangerousFlags('codex', set({ codex: { bypass: true } }))).toEqual([
    '--dangerously-bypass-approvals-and-sandbox',
  ]);
  expect(
    dangerousFlags(
      'codex',
      set({ codex: { approvalPolicy: 'never', sandbox: 'danger-full-access' } }),
    ),
  ).toEqual(['--sandbox=danger-full-access']);
  expect(dangerousFlags('codex', set({ codex: { sandbox: 'workspace-write' } }))).toEqual([]);
  expect(
    dangerousFlags('antigravity', set({ antigravity: { mode: 'accept-edits', sandbox: true } })),
  ).toEqual([]);
  expect(dangerousFlags('antigravity', set({ antigravity: { skipPermissions: true } }))).toEqual([
    '--dangerously-skip-permissions',
  ]);
});
