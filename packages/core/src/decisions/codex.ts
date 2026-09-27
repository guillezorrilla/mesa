import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCodexResult } from '../agents/codex/result.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';

/**
 * Codex has no --tools "". Native deny-all filesystem/network permissions block even its
 * remaining apply_patch tool. Fail closed with --strict-config on unsupported CLIs. The live
 * denied-read/write probe and config/source references are in docs/spikes/codex.md (#160).
 */
export const codexDecisionArgs = (prompt: string, directory: string, schema: string) => [
  'exec',
  '--json',
  '-C',
  directory,
  '--output-schema',
  schema,
  '--ignore-user-config',
  '--ignore-rules',
  '--ephemeral',
  '--skip-git-repo-check',
  '--strict-config',
  ...[
    'approval_policy="never"',
    'default_permissions="faro"',
    'permissions.faro.filesystem={"/"="deny"}',
    'permissions.faro.network.enabled=false',
    'features.shell_tool=false',
    'features.apps=false',
    'features.plugins=false',
    'features.hooks=false',
    'features.memories=false',
    'features.chronicle=false',
    'features.skip_host_skill_discovery=true',
    'features.skill_search=false',
    'features.multi_agent=false',
    'features.browser_use=false',
    'features.computer_use=false',
    'features.image_generation=false',
    'features.view_image=false',
    'features.goals=false',
    'web_search="disabled"',
    'project_doc_max_bytes=0',
    'include_environment_context=false',
    'tools.update_plan.enabled=false',
  ].flatMap((setting) => ['-c', setting]),
  prompt,
];

/** A private schema and empty working folder, removed even when the provider fails. */
export async function codexDecision(
  run: Runner,
  root: string,
  prompt: string,
  schema: unknown,
  timeoutMs: number,
): Promise<unknown> {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(root, '.faro-'));
  try {
    const file = join(directory, 'answer.schema.json');
    writeFileSync(file, JSON.stringify(schema), { mode: 0o600 });
    const res = await run('codex', codexDecisionArgs(prompt, directory, file), timeoutMs);
    if (!res.ok)
      throw new MesaError('agent_unavailable', `codex exec: ${res.reason}: ${res.detail}`);
    const result = readCodexResult(res.stdout);
    if (!result.read || !result.ok) {
      throw new MesaError('agent_unavailable', result.reason ?? 'codex returned no answer');
    }
    return JSON.parse(result.output);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
