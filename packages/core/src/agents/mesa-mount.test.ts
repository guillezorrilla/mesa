import { expect, test } from 'vitest';
import { NATIVE_LAUNCH as NATIVE, tempDir } from '../testing/index.js';
import { AGENTS, startCommand } from './agents.js';
import { claudeMountArgs, launchMounts } from './mesa-mount.js';

// The exact argv each agent command carries (docs/spikes/vault-mcp.md, appendix), for a mesa run
// as `node <script>`, as the CLI runs it.

const MOUNTS = launchMounts(['/opt/node', '/src/mesa.js'], { decisions: false });
const MCP = `'--mcp-config={"mcpServers":{"mesa-vault":{"type":"stdio","command":"/opt/node","args":["/src/mesa.js","vault","mcp"]}}}'`;
const CLAUDE = `${MCP} '--allowedTools=mcp__mesa-vault'`;
const CODEX = [
  `-c 'mcp_servers.mesa-vault.command="/opt/node"'`,
  `-c 'mcp_servers.mesa-vault.args=["/src/mesa.js","vault","mcp"]'`,
  `-c 'mcp_servers.mesa-vault.env_vars=["MESA_SESSION_ID","MESA_PROFILE"]'`,
  `-c 'mcp_servers.mesa-vault.default_tools_approval_mode="approve"'`,
].join(' ');
const ID = '360ed2a1-f255-4c2a-8f30-ba7b6ea349f5';
const MAY = { permissionMode: 'default', allowedTools: ['Bash(git log:*)'] };

test('the server is this mesa vault mcp, its profile and session from the window', () => {
  expect(MOUNTS.vault).toEqual({ command: '/opt/node', args: ['/src/mesa.js', 'vault', 'mcp'] });
});

test('Claude Code mounts it and pre-approves its tools on start, resume, fork, and headless', () => {
  expect(AGENTS.claude.start(ID, MOUNTS, NATIVE, 'Map the tides', 'plan')).toBe(
    `claude --session-id ${ID} --permission-mode plan ${CLAUDE} 'Map the tides'`,
  );
  expect(AGENTS.claude.start(ID, MOUNTS, NATIVE)).toBe(`claude --session-id ${ID} ${CLAUDE}`);
  expect(AGENTS.claude.resume(ID, '/src/lantern-cove', MOUNTS, NATIVE)).toBe(
    `claude --resume ${ID} ${CLAUDE}`,
  );
  expect(AGENTS.claude.fork(ID, '/src/lantern-cove', MOUNTS, NATIVE, 'plan')).toBe(
    `claude --resume '${ID}' --fork-session --permission-mode plan ${CLAUDE}`,
  );
  // --allowedTools is variadic and last: the vault's tools, then the profile's.
  expect(AGENTS.claude.headless.command(ID, '/tide-report', MAY, '/src/lantern-cove', MOUNTS)).toBe(
    `claude -p '/tide-report' --session-id ${ID} --output-format json --permission-mode 'default' ${MCP} --allowedTools 'mcp__mesa-vault' 'Bash(git log:*)'`,
  );
  const none = { permissionMode: 'default', allowedTools: [] };
  expect(AGENTS.claude.headless.command(ID, '/tide-report', none, '/src', MOUNTS)).toMatch(
    /--allowedTools 'mcp__mesa-vault'$/,
  );
  // A background start takes the same words unquoted, as argv.
  expect(claudeMountArgs(MOUNTS)).toEqual([
    '--mcp-config={"mcpServers":{"mesa-vault":{"type":"stdio","command":"/opt/node","args":["/src/mesa.js","vault","mcp"]}}}',
    '--allowedTools=mcp__mesa-vault',
  ]);
});

test('Codex mounts it with its window variables and approval on start, resume, fork, and exec', () => {
  expect(AGENTS.codex.start(MOUNTS, NATIVE, 'review')).toBe(
    `codex -c mesa.embedded=true ${CODEX} -- 'review'`,
  );
  expect(AGENTS.codex.start(MOUNTS, NATIVE)).toBe(`codex -c mesa.embedded=true ${CODEX}`);
  expect(AGENTS.codex.resume('019a-thread', '/src/lantern-cove', MOUNTS, NATIVE)).toBe(
    `codex -c mesa.embedded=true ${CODEX} resume '019a-thread' -C '/src/lantern-cove'`,
  );
  expect(AGENTS.codex.fork('019a-thread', '/src/lantern-cove', MOUNTS, NATIVE)).toBe(
    `codex -c mesa.embedded=true ${CODEX} fork '019a-thread' -C '/src/lantern-cove'`,
  );
  expect(
    AGENTS.codex.headless.command(undefined, '$tide-report', MAY, '/src/lantern-cove', MOUNTS),
  ).toBe(
    `codex exec --json -C '/src/lantern-cove' -c approval_policy=never -c sandbox_mode=workspace-write ${CODEX} '$tide-report'`,
  );
});

test("a read-only headless run turns mesa-vault's save tools off; Antigravity has no per-run rule", () => {
  const readOnly = { ...MAY, readOnlyVault: true };
  // Claude: a deny of each save, which wins over the server's allow, before the variadic allow.
  expect(
    AGENTS.claude.headless.command(ID, '/import-notes', readOnly, '/src/lantern-cove', MOUNTS),
  ).toBe(
    `claude -p '/import-notes' --session-id ${ID} --output-format json --permission-mode 'default' ${MCP} --disallowedTools 'mcp__mesa-vault__save_decision' 'mcp__mesa-vault__save_summary' 'mcp__mesa-vault__save_note' --allowedTools 'mcp__mesa-vault' 'Bash(git log:*)'`,
  );
  // Codex: the server's own deny list.
  expect(
    AGENTS.codex.headless.command(
      undefined,
      '$import-notes',
      readOnly,
      '/src/lantern-cove',
      MOUNTS,
    ),
  ).toBe(
    `codex exec --json -C '/src/lantern-cove' -c approval_policy=never -c sandbox_mode=workspace-write ${CODEX} -c 'mcp_servers.mesa-vault.disabled_tools=["save_decision","save_summary","save_note"]' '$import-notes'`,
  );
  expect(AGENTS.antigravity.headless.command(undefined, '/import-notes', readOnly, '/l.log')).toBe(
    `agy --log-file '/l.log' --print '/import-notes' --output-format json`,
  );
});

test('a start mounts it per launch for Claude Code and Codex; Antigravity reads its global entry', () => {
  expect(startCommand('claude', MOUNTS, NATIVE, { agentSessionId: ID, goal: 'go' }, [])).toContain(
    CLAUDE,
  );
  expect(startCommand('codex', MOUNTS, NATIVE, { goal: 'go' }, [])).toContain(CODEX);
  const agy = startCommand('antigravity', MOUNTS, NATIVE, { id: 'aaaaaaaa', logs: tempDir() }, []);
  expect(agy).not.toContain('mesa-vault');
});
