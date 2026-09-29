import { defineCommand } from '../command.js';

export const backupCreate = defineCommand({
  name: 'backup create',
  summary:
    'Back up profile settings, registered projects, and saved prompts; retain the latest five',
  example: 'mesa backup create',
  run: ({ mesa }) => {
    const data = mesa.backup.create();
    return { data, text: data.path };
  },
});

export const backupRestore = defineCommand({
  name: 'backup restore',
  summary: 'Restore portable data into a new --profile with a new --vault path',
  args: ['file'],
  flags: { vault: { type: 'string', required: true, description: 'New, unused vault path' } },
  example: 'mesa --profile restored backup restore --vault /tmp/restored-vault /tmp/backup.json',
  run: ({ mesa, args, flags }) => {
    const data = mesa.backup.restore(args.file, flags.vault);
    return {
      data,
      text: `Restored ${data.profile} at ${data.path}. Run mesa --profile ${data.profile} vault init for an empty vault.`,
    };
  },
});
