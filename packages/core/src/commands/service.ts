import { AgentSchema } from '../agents/agents.js';
import { parseStreamLine } from '../agents/claude/stream/events.js';
import { DEFAULT_AGENT } from '../agents/names.js';
import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import { journalEntries, readJournal } from '../sessions/host/journal.js';
import { sessionFolder } from '../sessions/record/folder.js';
import { projectScope } from '../sessions/record/general.js';
import { type SlashCommand, slashCommands } from './catalog.js';

/**
 * The commands and skills a Structured Claude Code session's agent named in its last
 * `system/init` (ADR-0029), described from `catalog` where it has them; none before its first init.
 */
function initCommands(lines: readonly string[], catalog: readonly SlashCommand[]) {
  let init: { slashCommands: string[]; skills: string[] } | undefined;
  for (const { event } of journalEntries(lines)) {
    const parsed = event === undefined ? undefined : parseStreamLine(event);
    if (parsed?.type === 'init') init = parsed;
  }
  if (!init) return undefined;
  const known = new Map(catalog.map((c) => [c.name, c]));
  const { skills } = init;
  return init.slashCommands.map(
    (name): SlashCommand =>
      known.get(name) ?? {
        name,
        description: '',
        source: skills.includes(name) ? 'skill' : 'builtin',
      },
  );
}

/** The slash commands an agent offers a session or a project (catalog.ts). */
export function commandsService(ctx: MesaContext) {
  return {
    /**
     * For a session id: its agent, in its own folder (worktree or cwd, else its project's); a
     * Structured Claude Code session's are what its agent's init named. For a registered project
     * name: claude. `agent` overrides either.
     */
    commands: (target: string, agent?: string) => {
      const chosen = agent === undefined ? undefined : AgentSchema.safeParse(agent);
      if (chosen && !chosen.success) {
        throw new MesaError('usage', `unknown agent ${agent}; use claude, codex or antigravity`);
      }
      const record = ctx.store.list().find((r) => r.id === target);
      const scope = record ? projectScope(record.project) : target;
      const projectDir =
        (record && sessionFolder(record)) ||
        (scope ? findProject(ctx.open(), scope).path : undefined);
      const own = record && record.agent !== 'terminal' ? record.agent : DEFAULT_AGENT;
      const catalog = slashCommands({
        home: ctx.home,
        env: ctx.env,
        agent: chosen?.data ?? own,
        projectDir,
      });
      const fromInit =
        record?.view === 'structured' && record.agent === 'claude' && !chosen
          ? initCommands(readJournal(ctx.paths.journals, record.id) ?? [], catalog)
          : undefined;
      return fromInit ?? catalog;
    },
  };
}
