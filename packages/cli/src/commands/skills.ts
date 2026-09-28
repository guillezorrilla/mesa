import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

export const skillsList = defineCommand({
  name: 'skills list',
  summary: 'List effective Mesa and native provider skill sources',
  args: ['project?'],
  example: 'mesa skills list lantern-cove',
  run: ({ mesa, args }) => {
    const rows = mesa.skills.inventory(args.project);
    const text = rows.length
      ? columns(
          rows.map((s) => [s.name, s.scope, s.enabled ? 'enabled' : 'off', s.description]),
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

const documentFlags = {
  project: { type: 'string' as const, description: 'Registered project scope' },
  file: { type: 'string' as const, description: 'Listed skill support file (default: SKILL.md)' },
};

export const skillsRead = defineCommand({
  name: 'skills read',
  summary: 'Preview a skill file with its revision',
  args: ['id'],
  flags: documentFlags,
  example: 'mesa skills read /path/to/my-skill --project lantern-cove',
  run: ({ mesa, args, flags }) => {
    const data = mesa.skills.read(args.id, flags.project, flags.file);
    return { data, text: data.text };
  },
});

export const skillsWrite = defineCommand({
  name: 'skills write',
  summary: 'Save a writable skill file when its read revision is current',
  args: ['id'],
  flags: {
    ...documentFlags,
    text: { type: 'string', required: true, description: 'New UTF-8 text' },
    revision: { type: 'string', required: true, description: 'Revision from skills read' },
  },
  example: 'mesa skills write /path/to/my-skill --text "New text" --revision <sha256>',
  run: ({ mesa, args, flags }) => {
    const recorded = mesa.skills.write(
      args.id,
      flags.text,
      flags.revision,
      flags.project,
      flags.file,
    );
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `saved ${flags.file ?? 'SKILL.md'}`,
    });
  },
});
