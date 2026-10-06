import { AGENTS, type AgentSpec } from '../agents/agents.js';
import { AGENT_EXECUTABLES, type Agent } from '../agents/names.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';

// A binary probe: `<name> <version args>` with a timeout, as doctor shows each row and a
// session's start checks its agent.

export const CHECK_TIMEOUT_MS = 2000;
/** How to install tmux, which doctor's row and the tmux backend's missing-binary error name. */
export const TMUX_INSTALL = 'brew install tmux';

/** A binary Mesa needs, how to ask its version, and how to install it. */
export type Binary = {
  name: string;
  args: readonly string[];
  role: 'required' | 'agent';
  install: string;
};

/** The binary's Homebrew command, when it installs with one (Mesa can run it). */
export const homebrewInstall = (b: Binary) =>
  b.install.startsWith('brew ') ? b.install : undefined;

/** What a probe found: its version, or `hint`, why it failed and how to install it. */
export type Probe = { name: string; ok: boolean; version?: string; hint: string };

export const firstVersion = (text: string) => text.match(/\d+\.\d+[\w.-]*/)?.[0];

export async function probe(run: Runner, b: Binary): Promise<Probe> {
  const res = await run(b.name, [...b.args], CHECK_TIMEOUT_MS);
  if (res.ok) return { name: b.name, ok: true, version: firstVersion(res.stdout), hint: '' };
  const command = `\`${b.name} ${b.args.join(' ')}\``;
  const why = {
    missing: 'not found on PATH',
    timeout: `${command} did not answer within ${CHECK_TIMEOUT_MS / 1000} s`,
    failed: `${command} failed: ${res.detail}`,
  }[res.reason];
  const install = b.install.startsWith('https://')
    ? `see ${b.install} to install`
    : `install with \`${b.install}\``;
  return { name: b.name, ok: false, hint: `${why}; ${install}` };
}

/** An agent's binary, as doctor and a session's start probe it. */
export function agentBinary(name: Agent): Binary {
  return {
    name: AGENT_EXECUTABLES[name],
    args: AGENTS[name].versionArgs,
    role: 'agent',
    install: AGENTS[name].install,
  };
}

/** The agent's entry once its binary answers; agent_unavailable otherwise, saying why and how to install it. */
export async function readyAgent(run: Runner, agent: Agent): Promise<AgentSpec> {
  const check = await probe(run, agentBinary(agent));
  if (!check.ok) throw new MesaError('agent_unavailable', `${agent} ${check.hint}`);
  return AGENTS[agent];
}
