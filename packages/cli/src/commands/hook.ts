import { defineCommand } from '../command.js';

/**
 * Run by tmux's pane-died hook, never by hand: the agent in a Mesa window exited, so what was
 * queued after its session starts, and its receipt gets its last output lines.
 */
export const hookTmux = defineCommand({
  name: 'hook tmux',
  summary: 'Record a tmux hook (run by the pane-died hook Mesa sets on its tmux server)',
  // `project`: tmux calls it a session; CONTEXT.md keeps session for Mesa's (Window).
  args: ['event', 'project', 'window'],
  example: 'mesa hook tmux pane-died lantern-cove claude-a1b2c3d4',
  run: async ({ mesa, args }) => {
    // Any other event, and any window that is no session's, is not Mesa's: exit 0, recorded nothing.
    const exited = await mesa.tmuxEvent(args.event, args.project, args.window);
    return { data: { recorded: Boolean(exited), session: exited?.id ?? null }, text: '' };
  },
});

/**
 * Run by the agent's hooks, never by hand. Claude and Codex events are logged and SessionEnd
 * starts the queue; SessionStart prints the pointer, and UserPromptSubmit decision advice as hook
 * JSON when there is any. Antigravity PreInvocation returns a transient instruction as hook JSON.
 */
export const hook = defineCommand({
  name: 'hook',
  summary: 'Record an agent hook payload from stdin (run by the hooks mesa hooks install adds)',
  args: ['agent'],
  example: 'mesa hook claude < payload.json',
  run: async ({ mesa, args, stdin }) => {
    if (args.agent === 'antigravity') {
      let instruction: string | undefined;
      try {
        instruction = await mesa.antigravityInstruction(await stdin());
      } catch {
        // Hook failures must not block the provider's model call.
      }
      return {
        data: { delivered: Boolean(instruction) },
        text: JSON.stringify(
          instruction ? { injectSteps: [{ ephemeralMessage: instruction }] } : {},
        ),
      };
    }
    const event = await mesa.hookEvent(args.agent, await stdin());
    const advice = event && 'advice' in event ? event.advice : undefined;
    return {
      data: {
        recorded: Boolean(event),
        event: event?.event ?? null,
        ...(advice ? { advised: true } : {}),
      },
      text: event && 'instruction' in event ? event.instruction : (advice ?? ''),
    };
  },
});
