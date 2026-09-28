import { MesaError, type WorktreeAction, type WorktreeRow } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const worktreesCreate = defineCommand({
  name: 'worktrees create',
  summary: "Create a linked worktree using this profile's location and carryover settings",
  args: ['project', 'branch'],
  flags: { base: { type: 'string', description: 'Start a new branch from this ref' } },
  example: 'mesa worktrees create lantern-cove feature',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.worktrees.create(args.project, args.branch, flags.base);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `created ${recorded.result.path}`,
    });
  },
});

export const worktreesRerun = defineCommand({
  name: 'worktrees rerun',
  summary: 'Rerun the configured setup in a linked worktree',
  args: ['project', 'checkout'],
  example: 'mesa worktrees rerun lantern-cove /path/to/worktree',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.worktrees.rerun(args.project, args.checkout);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `setup completed in ${recorded.result.path}`,
    });
  },
});

const action = (value: string): WorktreeAction => {
  if (value === 'remove' || value === 'recycle' || value === 'cleanup') return value;
  throw new MesaError('usage', 'action must be remove, recycle, or cleanup');
};

export const worktreesPreview = defineCommand({
  name: 'worktrees preview',
  summary: 'Preview a guarded worktree remove, recycle, or stale cleanup',
  args: ['project', 'checkout?'],
  flags: { action: { type: 'string', description: 'remove, recycle, or cleanup', required: true } },
  example: 'mesa worktrees preview lantern-cove /path/to/worktree --action remove',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.worktrees.preview(args.project, action(flags.action), args.checkout);
    return {
      data,
      text: `${data.allowed ? 'ready' : data.reasons.join('; ')}: ${data.paths.join(', ')}`,
    };
  },
});

export const worktreesApply = defineCommand({
  name: 'worktrees apply',
  summary: 'Apply a worktree action using its exact preview token',
  args: ['project', 'checkout?'],
  flags: {
    action: { type: 'string', description: 'remove, recycle, or cleanup', required: true },
    token: { type: 'string', description: 'Token returned by worktrees preview', required: true },
  },
  example: 'mesa worktrees apply lantern-cove /path/to/worktree --action remove --token abc123',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.worktrees.apply(
      args.project,
      action(flags.action),
      flags.token,
      args.checkout,
    );
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `${flags.action} changed ${recorded.result.paths.length} worktree registrations`,
    });
  },
});

export const worktreesList = defineCommand({
  name: 'worktrees list',
  summary: 'List Git worktrees and their current Mesa session holders',
  args: ['project'],
  flags: {
    branch: { type: 'string', description: 'Filter branch names' },
    holder: { type: 'string', description: 'Filter by session id' },
    state: { type: 'string', description: 'Filter ready, locked, stale, detached, or recycled' },
  },
  example: 'mesa worktrees list lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const state = flags.state;
    if (state && !['ready', 'locked', 'stale', 'detached', 'recycled'].includes(state))
      throw new MesaError('usage', 'state must be ready, locked, stale, detached, or recycled');
    const data = await mesa.worktrees.list(args.project, {
      branch: flags.branch,
      holder: flags.holder,
      state: state as WorktreeRow['state'] | undefined,
    });
    return {
      data,
      text:
        data
          .map(
            (row) =>
              `${row.main ? 'main' : (row.branch ?? 'detached')}  ${row.path}  ${row.state}  ${row.holders.map((holder) => holder.id).join(',')}`,
          )
          .join('\n') || 'no worktrees',
    };
  },
});
