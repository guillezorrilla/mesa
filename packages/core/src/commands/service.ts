import { AgentSchema } from '../agents/agents.js';
import { DEFAULT_AGENT } from '../agents/names.js';
import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import { sessionFolder } from '../sessions/record/folder.js';
import { projectScope } from '../sessions/record/general.js';
import { slashCommands } from './catalog.js';

/** The slash commands an agent offers a session or a project (catalog.ts). */
export function commandsService(ctx: MesaContext) {
  return {
    /**
     * For a session id: its agent, in its own folder (worktree or cwd, else its project's). For a
     * registered project name: claude. `agent` overrides either.
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
      return slashCommands({
        home: ctx.home,
        env: ctx.env,
        agent: chosen?.data ?? own,
        projectDir,
      });
    },
  };
}
