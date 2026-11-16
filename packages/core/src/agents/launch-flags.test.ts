import { describe, expect, it, test } from 'vitest';
import { CLAUDE_MESA, NATIVE_LAUNCH, tempDir } from '../testing/index.js';
import { AGENTS, startCommand } from './agents.js';
import {
  codexServerOverrides,
  dangerousFlags,
  type LaunchDefaults,
  launchFlags,
} from './launch-flags.js';

// The profile's launch defaults on the commands every start, resume, and fork runs, in each
// agent's own syntax, under the mount testDeps launches carry.

const ID = '360ed2a1-f255-4c2a-8f30-ba7b6ea349f5';
const FOLDER = '/src/lantern-cove';
const set = (patch: Partial<LaunchDefaults>): LaunchDefaults => ({ ...NATIVE_LAUNCH, ...patch });

test('unset defaults emit nothing, so each agent starts on its native config', () => {
  expect(startCommand('claude', NATIVE_LAUNCH, { agentSessionId: ID }, [])).toBe(
    `claude --session-id ${ID} ${CLAUDE_MESA}`,
  );
  expect(startCommand('codex', NATIVE_LAUNCH, {}, [])).toBe(`codex -c mesa.embedded=true`);
  expect(startCommand('antigravity', NATIVE_LAUNCH, { id: 'a1', logs: tempDir() }, [])).toMatch(
    /^umask 077; exec agy --log-file '[^']+'$/,
  );
  // False is the same as unset.
  const off = set({ claude: { skipPermissions: false }, codex: { bypass: false } });
  expect(startCommand('claude', off, { agentSessionId: ID }, [])).not.toContain('dangerous');
  expect(startCommand('codex', off, {}, [])).not.toContain('dangerous');
});

test('Claude Code skips permissions on start, resume, and fork; plan from the session wins', () => {
  const skip = set({ claude: { skipPermissions: true } });
  expect(startCommand('claude', skip, { agentSessionId: ID, goal: 'go' }, [])).toBe(
    `claude --session-id ${ID} --dangerously-skip-permissions ${CLAUDE_MESA} 'go'`,
  );
  expect(AGENTS.claude.resume(ID, FOLDER, skip)).toBe(
    `claude --resume ${ID} --dangerously-skip-permissions ${CLAUDE_MESA}`,
  );
  expect(AGENTS.claude.fork(ID, FOLDER, skip)).toBe(
    `claude --resume '${ID}' --fork-session --dangerously-skip-permissions ${CLAUDE_MESA}`,
  );
  expect(startCommand('claude', skip, { agentSessionId: ID, mode: 'plan' }, [])).toBe(
    `claude --session-id ${ID} --permission-mode plan ${CLAUDE_MESA}`,
  );
  expect(AGENTS.claude.resume(ID, FOLDER, skip, 'plan')).toBe(
    `claude --resume ${ID} --permission-mode plan ${CLAUDE_MESA}`,
  );
});

test('Codex takes its approval policy and sandbox; bypass replaces both', () => {
  const both = set({ codex: { approvalPolicy: 'on-request', sandbox: 'workspace-write' } });
  const flags = '--ask-for-approval=on-request --sandbox=workspace-write';
  expect(startCommand('codex', both, { goal: 'review' }, [])).toBe(
    `codex -c mesa.embedded=true ${flags} -- 'review'`,
  );
  expect(AGENTS.codex.resume('019a', FOLDER, both)).toBe(
    `codex -c mesa.embedded=true ${flags} resume '019a' -C '${FOLDER}'`,
  );
  expect(AGENTS.codex.fork('019a', FOLDER, both)).toBe(
    `codex -c mesa.embedded=true ${flags} fork '019a' -C '${FOLDER}'`,
  );
  expect(startCommand('codex', set({ codex: { sandbox: 'read-only' } }), {}, [])).toBe(
    `codex -c mesa.embedded=true --sandbox=read-only`,
  );
  const bypass = set({ codex: { approvalPolicy: 'never', sandbox: 'read-only', bypass: true } });
  expect(startCommand('codex', bypass, {}, [])).toBe(
    `codex -c mesa.embedded=true --dangerously-bypass-approvals-and-sandbox`,
  );
  expect(AGENTS.codex.resume('019a', FOLDER, bypass)).toBe(
    `codex -c mesa.embedded=true --dangerously-bypass-approvals-and-sandbox resume '019a' -C '${FOLDER}'`,
  );
});

test('Codex with extra folders gets the workspace-write sandbox, over read-only too', () => {
  const dirs = ['/src/tide-pool'];
  const extra = " '--add-dir' '/src/tide-pool'";
  expect(startCommand('codex', NATIVE_LAUNCH, { goal: 'go' }, dirs)).toBe(
    `codex -c mesa.embedded=true --sandbox=workspace-write${extra} -- 'go'`,
  );
  expect(AGENTS.codex.resume('019a', FOLDER, NATIVE_LAUNCH, undefined, dirs)).toBe(
    `codex -c mesa.embedded=true --sandbox=workspace-write resume '019a' -C '${FOLDER}'${extra}`,
  );
  expect(AGENTS.codex.fork('019a', FOLDER, NATIVE_LAUNCH, undefined, dirs)).toBe(
    `codex -c mesa.embedded=true --sandbox=workspace-write fork '019a' -C '${FOLDER}'${extra}`,
  );
  const flagsFor = (codex: LaunchDefaults['codex']) =>
    launchFlags('codex', set({ codex }), undefined, dirs);
  expect(flagsFor({})).toEqual(['--sandbox=workspace-write']);
  expect(flagsFor({ sandbox: 'workspace-write' })).toEqual(['--sandbox=workspace-write']);
  expect(flagsFor({ sandbox: 'read-only' })).toEqual(['--sandbox=workspace-write']);
  expect(flagsFor({ sandbox: 'danger-full-access' })).toEqual(['--sandbox=danger-full-access']);
  expect(flagsFor({ sandbox: 'read-only', bypass: true })).toEqual([
    '--dangerously-bypass-approvals-and-sandbox',
  ]);
  expect(flagsFor({ approvalPolicy: 'on-request' })).toEqual([
    '--ask-for-approval=on-request',
    '--sandbox=workspace-write',
  ]);
  expect(dangerousFlags('codex', NATIVE_LAUNCH)).toEqual([]);
});

test('Antigravity takes skip permissions, its mode, and sandbox; plan from the session wins', () => {
  const logs = tempDir();
  const all = set({
    antigravity: { skipPermissions: true, mode: 'accept-edits', sandbox: true },
  });
  const flags = '--dangerously-skip-permissions --mode=accept-edits --sandbox';
  expect(startCommand('antigravity', all, { id: 'a1', logs, goal: 'go' }, [])).toMatch(
    new RegExp(`^umask 077; exec agy --log-file '[^']+' ${flags} --prompt-interactive 'go'$`),
  );
  expect(AGENTS.antigravity.resume('conv-1', '/l.log', all)).toBe(
    `umask 077; exec agy --log-file '/l.log' --conversation 'conv-1' ${flags}`,
  );
  expect(startCommand('antigravity', all, { id: 'a2', logs, mode: 'plan' }, [])).toMatch(
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

describe('codexServerOverrides', () => {
  const native = NATIVE_LAUNCH;
  it("gives codex app-server the TUI's policy, sandbox, model and effort as -c values", () => {
    expect(codexServerOverrides(native)).toEqual([]);
    expect(
      codexServerOverrides(
        {
          ...native,
          codex: { approvalPolicy: 'on-request', sandbox: 'read-only' },
          model: 'gpt-x',
          effort: 'low',
        },
        ['/w/other'],
      ),
    ).toEqual([
      'approval_policy="on-request"',
      'sandbox_mode="workspace-write"',
      'sandbox_workspace_write.writable_roots=["/w/other"]',
      'model="gpt-x"',
      'model_reasoning_effort="low"',
    ]);
    expect(
      codexServerOverrides({ ...native, codex: { bypass: true, approvalPolicy: 'on-request' } }),
    ).toEqual(['approval_policy="never"', 'sandbox_mode="danger-full-access"']);
  });
});
