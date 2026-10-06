import { defineCommand } from '../../command.js';

export const automationsApprove = defineCommand({
  name: 'automations approve',
  summary: 'Approve one saved pending run; never overrides a block',
  args: ['id'],
  example: 'mesa automations approve 01ARZ3NDEKTSV4RRFFQ69G5FAV',
  run: ({ mesa, args }) => ({
    data: mesa.automations.approve(args.id),
    text: 'Run approved for the next tick.',
  }),
});

export const automationsCancel = defineCommand({
  name: 'automations cancel',
  summary: 'Cancel one pending or queued run',
  args: ['id'],
  example: 'mesa automations cancel 01ARZ3NDEKTSV4RRFFQ69G5FAV',
  run: ({ mesa, args }) => ({ data: mesa.automations.cancel(args.id), text: 'Run cancelled.' }),
});
