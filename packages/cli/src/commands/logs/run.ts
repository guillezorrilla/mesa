import { defineCommand } from '../../command.js';

export const logsRun = defineCommand({
  name: 'logs run',
  summary:
    "Run a command as it is (colours, input, Ctrl-C, exit status) and keep its output as one of this project's log sources",
  args: ['name', 'command...'],
  flags: {
    project: { type: 'string', description: 'Its project (default: the one this folder is in)' },
  },
  example: 'mesa logs run tide-api -- ./gradlew bootRun',
  run: ({ mesa, args, flags }) => {
    const ran = mesa.logs.run(args.name, args.command, flags.project);
    return {
      data: ran,
      text: `mesa: keeping this output for the Logs panel in ${ran.path}`,
      exec: ran.exec,
    };
  },
});
