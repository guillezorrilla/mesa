import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

export const skillsList = defineCommand({
  name: 'skills list',
  summary: "List Mesa's skills, enabled or not; with a project, its own skills too",
  args: ['project?'],
  example: 'mesa skills list lantern-cove',
  run: ({ mesa, args }) => {
    const rows = mesa.skills.list(args.project);
    const text = rows.length
      ? columns(
          rows.map((s) => [s.name, s.source, s.enabled ? 'enabled' : 'off', s.description]),
        ).join('\n')
      : "no skills; Mesa's library is empty";
    return { data: rows, text };
  },
});

export const skillsSync = defineCommand({
  name: 'skills sync',
  summary:
    "Link the enabled skills into a project's .claude/skills and .agents/skills, and unlink Mesa's others",
  args: ['project'],
  example: 'mesa skills sync lantern-cove',
  run: ({ mesa, args }) => {
    const recorded = mesa.skills.sync(args.project);
    const r = recorded.result;
    const lines = [
      ...r.added.map((l) => `+ ${l}`),
      ...r.removed.map((l) => `- ${l}`),
      ...r.conflicts.map((l) => `! ${l} (the project's own; left alone)`),
      ...r.unknown.map((n) => `? ${n} (enabled, but not in Mesa's library)`),
    ];
    const text = lines.length ? lines.join('\n') : `skills in ${args.project} already in sync`;
    return recordedOutput(recorded, { data: r, text });
  },
});
