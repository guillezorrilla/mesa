import { MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';

export const profile = defineCommand({
  name: 'profile',
  summary: 'Show the active profile and its directory',
  example: 'mesa profile',
  run: ({ mesa }) => ({ data: mesa.info(), text: mesa.info().profile }),
});

export const profileList = defineCommand({
  name: 'profile list',
  summary: 'List the profiles: vault, projects, live sessions, and which one the app opens',
  example: 'mesa profile list',
  run: async ({ mesa }) => {
    const rows = await mesa.profiles.list();
    const text = rows
      .map((row) =>
        [
          `${row.current ? '*' : ' '} ${row.name}`,
          row.vault ?? '(config does not read)',
          `${row.projects} projects`,
          `${row.liveSessions} live`,
          ...(row.app ? ['opens in the app'] : []),
        ].join('  '),
      )
      .join('\n');
    return { data: rows, text };
  },
});

export const profileCreate = defineCommand({
  name: 'profile create',
  summary: 'Create a profile with its own vault; its setup guide runs when the app opens it',
  args: ['name'],
  flags: {
    vault: { type: 'string', description: 'Its vault: an existing one, or a new folder' },
    'new-vault': {
      type: 'boolean',
      description: 'A new vault beside the suggested one, ~/Documents/Mesa-<name>',
    },
    'copy-settings': {
      type: 'boolean',
      description: "Start from this profile's settings, without its vault and keys",
    },
  },
  example: 'mesa profile create client --new-vault',
  run: ({ mesa, args, flags }) => {
    const data = mesa.profiles.create({
      name: args.name,
      vault: flags.vault,
      newVault: flags['new-vault'],
      copySettings: flags['copy-settings'],
    });
    return { data, text: `created profile ${data.profile} with vault ${data.vault}` };
  },
});

export const profileRename = defineCommand({
  name: 'profile rename',
  summary: 'Rename a profile: its folder, tmux server and Keychain items move together',
  args: ['old', 'new'],
  example: 'mesa profile rename work client',
  run: async ({ mesa, args }) => {
    const data = await mesa.profiles.rename(args.old, args.new);
    return { data, text: `renamed profile ${data.from} to ${data.to}` };
  },
});

export const profileRemove = defineCommand({
  name: 'profile remove',
  summary: 'Remove a profile: stop its server, forget its projects and keys; the vault is kept',
  args: ['name'],
  flags: {
    'delete-vault': { type: 'boolean', description: 'Delete its vault folder too' },
    yes: { type: 'boolean', description: 'Remove without asking; required without a terminal' },
  },
  example: 'mesa profile remove client --yes',
  run: async ({ mesa, args, flags, confirm }) => {
    const deleteVault = Boolean(flags['delete-vault']);
    if (!flags.yes) {
      if (!confirm)
        throw new MesaError('usage', `confirm with mesa profile remove ${args.name} --yes`);
      const vault = deleteVault ? 'and DELETES its vault' : 'and keeps its vault';
      const question = `Remove profile ${args.name}? This stops its sessions' server, forgets its projects and keys, ${vault}.`;
      if (!(await confirm(question))) throw new MesaError('usage', 'nothing was removed');
    }
    const data = await mesa.profiles.remove(args.name, { deleteVault });
    const vault = data.vaultDeleted ? `deleted ${data.vault}` : `kept ${data.vault}`;
    return { data, text: `removed profile ${data.profile}; ${vault}` };
  },
});

export const profileUse = defineCommand({
  name: 'profile use',
  summary: 'Make a profile the one the app opens; MESA_PROFILE still wins when set',
  args: ['name'],
  example: 'mesa profile use client',
  run: ({ mesa, args }) => {
    const data = mesa.profiles.use(args.name);
    return { data, text: `the app opens profile ${data.profile}` };
  },
});

export const profileOpen = defineCommand({
  name: 'profile open',
  summary: "Show a profile's folder in Finder",
  args: ['name'],
  example: 'mesa profile open client',
  run: async ({ mesa, args }) => {
    const data = await mesa.profiles.open(args.name);
    return { data, text: `opened ${data.dir}` };
  },
});
