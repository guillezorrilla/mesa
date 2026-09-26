import { closeSync, existsSync, openSync, readdirSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS } from '../agents.js';
import { checkAgent } from '../doctor.js';
import { findProject } from '../projects.js';
import { readRegistry } from '../registry.js';
import { MesaError } from '../result.js';
import type { AgentProcess } from './agent-listing.js';
import { projectOf } from './list.js';
import { createRecord, type OpenDeps, startWindow } from './open.js';
import type { SessionRecord } from './store.js';

// Adopting a Claude Code session Mesa did not start (CONTEXT.md, Adopted session).

export type AdoptDeps = OpenDeps & {
  /** The live agent sessions (listAgentProcesses). */
  listing: () => Promise<AgentProcess[]>;
  /** Agent session ids other profiles' records hold. */
  elsewhere: () => ReadonlySet<string>;
  /** Where Claude Code keeps transcripts, `~/.claude/projects/<folder>/<id>.jsonl`. */
  transcripts: string;
};

/** Where Claude Code keeps every session's transcript, one folder per working folder. */
export const claudeTranscripts = (home: string) => join(home, '.claude', 'projects');

/** Said with every adoption: two agents writing one transcript would interleave it. */
const WARNING = 'end the session in its original terminal first: both hold the same transcript';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ponytail: the folder is on a transcript's first lines; 1 MiB holds them, read more if one does not.
const HEAD_BYTES = 1 << 20;

/** The folder a transcript's session ran in: the first line naming one. */
function transcriptCwd(transcripts: string, id: string): string | undefined {
  if (!existsSync(transcripts)) return undefined;
  const file = readdirSync(transcripts)
    .map((folder) => join(transcripts, folder, `${id}.jsonl`))
    .find((f) => existsSync(f));
  if (!file) return undefined;
  const fd = openSync(file, 'r');
  const head = Buffer.alloc(HEAD_BYTES);
  const read = (() => {
    try {
      return readSync(fd, head, 0, HEAD_BYTES, 0);
    } finally {
      closeSync(fd);
    }
  })();
  for (const line of head.subarray(0, read).toString('utf8').split('\n')) {
    try {
      const cwd = (JSON.parse(line) as { cwd?: unknown }).cwd;
      if (typeof cwd === 'string') return cwd;
    } catch {
      // A line cut at the end of the head, or not JSON.
    }
  }
  return undefined;
}

/**
 * Records a Claude Code session Mesa did not start, found live (the listing) or on disk (its
 * transcript), as an adopted session of the project its folder is in (else `project`), and,
 * unless `noResume`, reopens its conversation in a Mesa window, in that folder. The warning is
 * always the same: the original terminal still holds the conversation.
 */
export async function adoptSession(
  deps: AdoptDeps,
  input: { agentSessionId: string; project?: string; name?: string; noResume?: boolean },
): Promise<{ record: SessionRecord; warning: string }> {
  const id = input.agentSessionId;
  if (!UUID.test(id)) {
    throw new MesaError('usage', `${id} is not a Claude Code session id (a lowercase UUID)`);
  }
  if (input.name !== undefined && !input.name.trim()) {
    throw new MesaError('usage', 'the name is empty');
  }
  const held = deps.store
    .list()
    .filter((r) => r.agentSessionId === id)
    .at(-1);
  if (held) throw new MesaError('usage', `Mesa has ${id} already, as session ${held.id}`);
  if (deps.elsewhere().has(id)) {
    throw new MesaError('usage', `another profile's session has ${id} already`);
  }
  const live = (await deps.listing()).find((p) => p.agentSessionId === id);
  const cwd = live?.cwd ?? transcriptCwd(deps.transcripts, id);
  if (cwd === undefined) {
    throw new MesaError(
      'not_found',
      `no Claude Code session ${id}, live or in ${deps.transcripts}`,
    );
  }
  const found = projectOf(cwd, readRegistry(deps.profile.paths.registry));
  if (found && input.project !== undefined && input.project !== found) {
    throw new MesaError(
      'usage',
      `session ${id} ran in ${cwd}, in project ${found}: drop --project, or pass --project ${found}`,
    );
  }
  const name = found ?? input.project;
  if (name === undefined) {
    throw new MesaError(
      'not_found',
      `no registered project holds ${cwd}: register it, or pass --project`,
    );
  }
  const project = findProject(deps.profile, name);
  const s = {
    project,
    agent: 'claude' as const,
    agentSessionId: id,
    adopted: true as const,
    // Where claude finds the conversation, when it is not the project's own folder.
    ...(cwd === project.path ? {} : { cwd }),
    ...(input.name === undefined ? {} : { name: input.name }),
  };
  if (input.noResume) return { record: createRecord(deps, s), warning: WARNING };
  const check = await checkAgent(deps.run, 'claude');
  if (!check.ok) throw new MesaError('agent_unavailable', `claude ${check.hint}`);
  const record = await startWindow(deps, { ...s, command: AGENTS.claude.resume(id) });
  return { record, warning: WARNING };
}
