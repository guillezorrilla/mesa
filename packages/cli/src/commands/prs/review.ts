import { VERDICT_STATES } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { decimal, wholeNumber } from '../../input/flags.js';
import { recordedOutput } from '../../output/recorded.js';

export const prsStart = defineCommand({
  name: 'prs start',
  summary:
    'Start a review session on a pull request in a worktree at its head (or name the one running); it leaves pending drafts, or posts them as comments with --post',
  args: ['project', 'number'],
  flags: {
    post: {
      type: 'boolean',
      description: 'Post the review as comments once written (Claude only); never an approval',
    },
  },
  example: 'mesa prs start lantern-cove 482',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.prs.start(args.project, wholeNumber(args.number, 'number'), {
      ...(flags.post ? { post: true } : {}),
    });
    return {
      data,
      text: `${
        data.existing
          ? `Review of #${args.number} is already running: ${data.session}`
          : `Started ${data.session}: review #${args.number}, round ${data.round}, ${data.mode}, at ${data.head.slice(0, 7)} in ${data.worktree}`
      }${data.guard === 'prompt' ? '; guarded by its prompt only (no deny rules for this agent)' : ''}`,
    };
  },
});
export const prsPublish = defineCommand({
  name: 'prs publish',
  summary:
    'Post your pending drafts on a pull request as comments; only from a review session started with --post, never an approval',
  args: ['project', 'number'],
  example: 'mesa prs publish lantern-cove 482',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.prs.publish(args.project, wholeNumber(args.number, 'number'));
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `Published ${recorded.result.published} comments on #${args.number}`,
    });
  },
});

export const prsVerdict = defineCommand({
  name: 'prs verdict',
  summary:
    'Record whether an earlier thread of yours was addressed; only from a review session of that pull request, kept by Mesa for its round',
  args: ['project', 'number'],
  flags: {
    thread: { type: 'string', required: true, description: 'The thread id (mesa prs show)' },
    state: {
      type: 'string',
      required: true,
      description: `One of ${VERDICT_STATES.join(', ')}`,
    },
    note: { type: 'string', description: 'Why, in a sentence' },
    confidence: { type: 'string', description: 'How sure, from 0 to 1' },
  },
  example:
    'mesa prs verdict lantern-cove 482 --thread PRRT_1 --state partly --note "renames still miss"',
  run: async ({ mesa, args, flags }) => {
    const data = mesa.prs.verdict(args.project, wholeNumber(args.number, 'number'), {
      thread: flags.thread,
      state: flags.state as (typeof VERDICT_STATES)[number],
      ...(flags.note ? { note: flags.note } : {}),
      ...(flags.confidence ? { confidence: decimal(flags.confidence, '--confidence') } : {}),
    });
    return { data, text: `${data.thread}: ${data.state} (round ${data.round})` };
  },
});
